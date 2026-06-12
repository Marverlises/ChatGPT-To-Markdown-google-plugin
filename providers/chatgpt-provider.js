(function(global) {
    let accessToken = null;

    function getElements() {
        return document.querySelectorAll('div[data-message-id]');
    }

    function processCodeBlocks(doc) {
        doc.querySelectorAll('pre').forEach(pre => {
            const codeType = pre.querySelector('div > div:first-child')?.textContent || '';
            const markdownCode = pre.querySelector('div > div:nth-child(3) > code')?.textContent || pre.textContent;
            pre.innerHTML = `\n\`\`\`${codeType}\n${markdownCode}\n\`\`\``;
        });
    }

    async function localizeImages(html, imagePrefix, messageKey, context) {
        if (!html) return html;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const images = Array.from(doc.querySelectorAll('img[src]'));

        for (let index = 0; index < images.length; index++) {
            const img = images[index];
            const source = img.getAttribute('src') || '';
            if (!source) continue;

            try {
                const extension = getImageExtensionFromUrl(source, img.getAttribute('alt')) || 'png';
                const fileId = getImageFileIdFromUrl(source);
                const imageName = fileId || `${messageKey}-${index + 1}`;
                const imageFilename = `${context.sanitizeFilename(imagePrefix)}-${context.sanitizeFilename(imageName)}.${extension}`;
                const relativePath = `images/${imageFilename}`;
                const absoluteSource = new URL(source, window.location.origin).href;

                if (/^data:image\//i.test(source)) {
                    await context.downloadDataUrlFile(source, relativePath);
                } else if (isChatGptApiImageUrl(absoluteSource)) {
                    await downloadFetchedImage(absoluteSource, relativePath, context);
                } else {
                    await context.downloadUrlFile(absoluteSource, relativePath);
                }

                img.setAttribute('src', relativePath);
                context.log?.(`已下载页面图片: ${relativePath}`);
            } catch (error) {
                console.log("[ChatGPT to Markdown] image download failed", source, error);
            }
        }

        return doc.body.innerHTML;
    }

    async function getConversations(context) {
        const limit = 50;
        const queryBuilders = [
            offset => `/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated`,
            offset => `/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated&is_archived=false`,
            offset => `/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated&is_archived=false&is_starred=false`
        ];

        for (let queryIndex = 0; queryIndex < queryBuilders.length; queryIndex++) {
            let offset = 0;
            const conversations = [];

            while (!context.shouldStop()) {
                const url = queryBuilders[queryIndex](offset);
                context.log(`请求列表: offset=${offset}, limit=${limit}, 方案=${queryIndex + 1}`);
                const data = await fetchJson(url, context);
                const items = getConversationItems(data);

                if (offset === 0) {
                    context.log(`列表响应摘要: ${summarizeConversationListResponse(data, items)}`);
                }

                conversations.push(...items);

                if (items.length < limit) break;
                offset += limit;
                await context.randomDelayBetweenRequests();
            }

            if (conversations.length) {
                return dedupeConversations(conversations);
            }
        }

        return [];
    }

    function getTitle(conversation, index) {
        const title = [
            conversation?.title,
            conversation?.name,
            conversation?.label,
            conversation?.conversation_title
        ].find(value => typeof value === 'string' && value.trim());

        if (title) return title.trim();
        return `untitled-${conversation?.id || index || Date.now()}`;
    }

    async function getDetail(conversation, context) {
        return fetchJson(`/backend-api/conversation/${conversation.id}`, context);
    }

    async function getAllConversationsForUnarchive(context) {
        const limit = 50;
        const queryBuilders = [
            {
                label: "all",
                build: offset => `/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated`
            },
            {
                label: "archived",
                build: offset => `/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated&is_archived=true`
            },
            {
                label: "unarchived",
                build: offset => `/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated&is_archived=false`
            }
        ];
        const conversations = [];

        for (const query of queryBuilders) {
            let offset = 0;

            while (!context.shouldStop()) {
                const url = query.build(offset);
                context.log(`Fetching ${query.label} conversation list: offset=${offset}, limit=${limit}`);
                const data = await fetchJson(url, context);
                const items = getConversationItems(data);
                context.log(`${query.label} list returned ${items.length} conversations`);
                conversations.push(...items);

                if (items.length < limit) break;
                offset += limit;
                await context.randomDelayBetweenRequests();
            }
        }

        return dedupeConversations(conversations);
    }

    async function unarchiveConversation(conversation, context) {
        if (!conversation?.id) {
            throw new Error("Conversation is missing id");
        }

        return fetchJson(`/backend-api/conversation/${conversation.id}`, context, {
            method: "PATCH",
            body: {is_archived: false}
        });
    }

    async function toMarkdown(conversation, meta, context) {
        const title = conversation.title || conversation.conversation_id || 'ChatGPT Conversation';
        const messages = getVisibleMessages(conversation);
        let markdown = `# ${title}\n\n`;
        markdown += '- source: chatgpt\n';

        if (conversation.create_time) {
            markdown += `- 创建时间: ${context.formatTime(conversation.create_time)}\n`;
        }
        if (conversation.update_time) {
            markdown += `- 更新时间: ${context.formatTime(conversation.update_time)}\n`;
        }
        markdown += '\n---\n';

        for (const message of messages) {
            const role = message.author?.role;
            const label = role === 'user' ? '用户问题' : '回答';
            const content = (await extractMessageText(message, meta.imagePrefix, context)).trim();
            if (content) {
                markdown += `\n# ${label}\n${content}\n`;
            }
        }

        return markdown.replace(/\n{3,}/g, '\n\n').trim() + '\n';
    }

    async function fetchJson(url, context, options = {}) {
        const startedAt = Date.now();
        const headers = await getRequestHeaders(context);
        const method = options.method || 'GET';

        if (options.body !== undefined) {
            headers['content-type'] = 'application/json';
        }

        const response = await fetch(url, {
            method,
            credentials: 'include',
            headers,
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined
        });
        const responseHeaders = Object.fromEntries(response.headers.entries());
        const responseText = await response.text();
        let responseBody = responseText;

        try {
            responseBody = responseText ? JSON.parse(responseText) : null;
        } catch (error) {
            responseBody = responseText;
        }

        logRequest({
            url,
            method,
            status: response.status,
            ok: response.ok,
            elapsedMs: Date.now() - startedAt,
            requestHeaders: maskSensitiveHeaders(headers),
            requestBody: options.body,
            responseHeaders,
            responseBody
        }, context);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return responseBody;
    }

    async function getRequestHeaders(context) {
        const headers = {accept: 'application/json'};
        const captured = await getCapturedHeaders();
        const capturedAuthorization = captured.headers?.authorization;
        const token = capturedAuthorization
            ? capturedAuthorization.replace(/^Bearer\s+/i, '')
            : await getAccessToken(context);

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        if (captured.meta?.hasCookie) {
            context.log("已从刷新请求中捕获 Cookie，当前同源 fetch 会通过 credentials 自动携带");
        }

        return headers;
    }

    function getCapturedHeaders() {
        return new Promise(resolve => {
            chrome.runtime.sendMessage({action: "getChatGPTCapturedHeaders"}, response => {
                if (chrome.runtime.lastError || !response?.success) {
                    resolve({headers: {}, meta: {}});
                    return;
                }
                resolve(response);
            });
        });
    }

    async function getAccessToken(context) {
        if (accessToken) return accessToken;

        try {
            const response = await fetch('/api/auth/session', {
                credentials: 'include',
                headers: {accept: 'application/json'}
            });
            const text = await response.text();
            const session = text ? JSON.parse(text) : {};
            accessToken = session.accessToken || session.access_token || null;

            if (accessToken) {
                context.log("已获取 Authorization token");
            } else {
                context.log("未从 /api/auth/session 获取到 Authorization token");
            }
        } catch (error) {
            context.log(`获取 Authorization token 失败: ${error.message}`);
            accessToken = null;
        }

        return accessToken;
    }

    function getConversationItems(data) {
        if (Array.isArray(data?.items)) return data.items;
        if (Array.isArray(data?.conversations)) return data.conversations;
        if (Array.isArray(data?.data?.items)) return data.data.items;
        if (Array.isArray(data?.data?.conversations)) return data.data.conversations;
        return [];
    }

    function summarizeConversationListResponse(data, items) {
        const keys = data && typeof data === 'object' ? Object.keys(data).join(', ') : typeof data;
        const total = data?.total ?? data?.total_count ?? data?.data?.total ?? '未知';
        return `items=${items.length}, total=${total}, keys=${keys || '无'}`;
    }

    function dedupeConversations(conversations) {
        const seen = new Set();
        return conversations.filter(conversation => {
            if (!conversation?.id) return false;
            if (seen.has(conversation.id)) return false;
            seen.add(conversation.id);
            return true;
        });
    }

    function maskSensitiveHeaders(headers) {
        return Object.fromEntries(Object.entries(headers).map(([key, value]) => {
            if (key.toLowerCase() === 'authorization') {
                return [key, value ? `${String(value).slice(0, 18)}...` : value];
            }
            return [key, value];
        }));
    }

    function logRequest(log, context) {
        const absoluteUrl = new URL(log.url, window.location.origin).href;
        console.groupCollapsed(`[ChatGPT Bulk Export] ${log.status} ${absoluteUrl}`);
        console.log('Request', {
            method: log.method || 'GET',
            url: absoluteUrl,
            credentials: 'include',
            headers: log.requestHeaders,
            body: log.requestBody
        });
        console.log('Response', {
            status: log.status,
            ok: log.ok,
            elapsedMs: log.elapsedMs,
            headers: log.responseHeaders
        });
        console.log('Response body', log.responseBody);
        console.groupEnd();
        context.log(`完整请求日志已输出到 Console: ${log.status} ${absoluteUrl}`);
    }

    function getVisibleMessages(conversation) {
        const mapping = conversation.mapping || {};
        const nodes = [];
        const currentNode = conversation.current_node;

        if (currentNode && mapping[currentNode]) {
            let node = mapping[currentNode];
            while (node) {
                nodes.unshift(node);
                node = node.parent ? mapping[node.parent] : null;
            }
        } else {
            Object.values(mapping).forEach(node => nodes.push(node));
            nodes.sort((a, b) => {
                const timeA = a.message?.create_time || 0;
                const timeB = b.message?.create_time || 0;
                return timeA - timeB;
            });
        }

        return nodes
            .map(node => node.message)
            .filter(message => {
                if (!message) return false;
                if (message.metadata?.is_visually_hidden_from_conversation) return false;
                const role = message.author?.role;
                if (role !== 'user' && role !== 'assistant') return false;
                return Boolean(hasMessageContent(message));
            });
    }

    function hasMessageContent(message) {
        const content = message.content || {};
        const parts = Array.isArray(content.parts) ? content.parts : [];
        if (parts.length) return parts.some(part => typeof part === 'string' ? part.trim() : part?.asset_pointer || part?.text);
        return Boolean(typeof content.text === 'string' && content.text.trim());
    }

    async function extractMessageText(message, imagePrefix, context) {
        const content = message.content || {};
        const parts = Array.isArray(content.parts) ? content.parts : [];

        if (parts.length) {
            const markdownParts = [];
            for (let index = 0; index < parts.length; index++) {
                const part = parts[index];
                if (typeof part === 'string') {
                    markdownParts.push(part);
                    continue;
                }
                if (part?.content_type === 'image_asset_pointer') {
                    const imageMarkdown = await downloadImagePart(part, imagePrefix, message.id, index, context);
                    markdownParts.push(imageMarkdown);
                    continue;
                }
                if (typeof part?.text === 'string') {
                    markdownParts.push(part.text);
                }
            }
            return markdownParts.filter(Boolean).join('\n\n');
        }

        if (typeof content.text === 'string') return content.text;
        return '';
    }

    async function downloadImagePart(part, imagePrefix, messageId, index, context) {
        const source = part.asset_pointer || part.url || part.image_url;
        if (!source) return '';

        const extension = getImageExtension(part) || 'png';
        const imageFilename = `${context.sanitizeFilename(imagePrefix)}-${messageId || 'message'}-${index + 1}.${extension}`;
        const relativePath = `images/${imageFilename}`;

        try {
            if (/^https?:\/\//i.test(source)) {
                if (isChatGptApiImageUrl(source)) {
                    await downloadFetchedImage(source, relativePath, context);
                } else {
                    await context.downloadUrlFile(source, relativePath);
                }
            } else if (source.startsWith('file-service://')) {
                await downloadFileServiceImage(source, relativePath, context);
            } else if (source.startsWith('sediment://')) {
                await downloadSedimentImage(source, relativePath, context);
            } else {
                context.log(`暂不支持下载图片资源: ${source}`);
                return `![image](${source})`;
            }

            context.log(`已下载图片: ${relativePath}`);
            return `![image](${relativePath})`;
        } catch (error) {
            context.log(`图片下载失败: ${source} - ${error.message}`);
            return `![image](${source})`;
        }
    }

    async function downloadFileServiceImage(assetPointer, filename, context) {
        const fileId = assetPointer.replace('file-service://', '');
        await downloadFetchedImage(`/backend-api/files/${encodeURIComponent(fileId)}/download`, filename, context);
    }

    async function downloadSedimentImage(assetPointer, filename, context) {
        const fileId = assetPointer.replace('sediment://', '');
        const pageImageUrl = findImageUrlByFileId(fileId);

        if (pageImageUrl) {
            if (isChatGptApiImageUrl(pageImageUrl)) {
                await downloadFetchedImage(pageImageUrl, filename, context);
            } else {
                await context.downloadUrlFile(pageImageUrl, filename);
            }
            return;
        }

        await downloadFetchedImage(`/backend-api/files/${encodeURIComponent(fileId)}/download`, filename, context);
    }

    async function downloadFetchedImage(url, filename, context) {
        const blob = await fetchBlob(url, context);
        const dataUrl = await context.blobToDataUrl(blob);
        await context.downloadDataUrlFile(dataUrl, filename);
    }

    async function fetchBlob(url, context, redirectDepth = 0) {
        if (redirectDepth > 5) {
            throw new Error('图片下载地址跳转次数过多');
        }

        const headers = await getRequestHeaders(context);
        headers.accept = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
        const response = await fetch(url, {
            credentials: 'include',
            headers
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (/application\/json/i.test(contentType)) {
            const data = await response.json();
            const downloadUrl = data?.download_url || data?.downloadUrl || data?.url;
            if (downloadUrl) {
                return fetchBlob(downloadUrl, context, redirectDepth + 1);
            }
            throw new Error('图片接口返回 JSON 但没有 download_url');
        }

        return response.blob();
    }

    function isChatGptApiImageUrl(source) {
        try {
            const url = new URL(source, window.location.origin);
            if (!/(^|\.)chatgpt\.com$/i.test(url.hostname) && !/(^|\.)openai\.com$/i.test(url.hostname)) {
                return false;
            }
            return /\/backend-api\/(?:estuary\/content|files\/[^/]+\/download)/i.test(url.pathname);
        } catch (error) {
            return /^\/?backend-api\/(?:estuary\/content|files\/[^/]+\/download)/i.test(String(source || ''));
        }
    }

    function findImageUrlByFileId(fileId) {
        if (!fileId) return '';

        const images = Array.from(document.querySelectorAll('img[src]'));
        const matched = images.find(img => {
            const src = img.getAttribute('src') || '';
            try {
                const url = new URL(src, window.location.origin);
                return url.searchParams.get('id') === fileId || src.includes(fileId);
            } catch (error) {
                return src.includes(fileId);
            }
        });

        return matched?.src || '';
    }

    function getImageFileIdFromUrl(source) {
        try {
            const url = new URL(source, window.location.origin);
            return url.searchParams.get('id') || '';
        } catch (error) {
            const match = String(source).match(/file_[a-zA-Z0-9_]+/);
            return match?.[0] || '';
        }
    }

    function getImageExtensionFromUrl(source, fallbackName = '') {
        try {
            const url = new URL(source, window.location.origin);
            const filename = url.searchParams.get('fn') || fallbackName || url.pathname;
            const match = String(filename).match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
            if (match?.[1]) return normalizeImageExtension(match[1]);
        } catch (error) {
            const match = String(fallbackName || source).match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
            if (match?.[1]) return normalizeImageExtension(match[1]);
        }

        return '';
    }

    function getImageExtension(part) {
        const mimeType = part.mime_type || part.metadata?.mime_type || '';
        const mimeExtension = mimeType.split('/')[1]?.split(';')[0];
        if (mimeExtension) return mimeExtension === 'jpeg' ? 'jpg' : mimeExtension;

        const source = part.asset_pointer || part.url || part.image_url || '';
        const match = String(source).match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
        return match?.[1]?.toLowerCase();
    }

    function normalizeImageExtension(extension) {
        const normalized = String(extension || '').toLowerCase();
        return normalized === 'jpeg' ? 'jpg' : normalized;
    }

    global.AI_EXPORT_PROVIDERS.registerProvider({
        id: "chatgpt",
        name: "ChatGPT",
        page: {
            getElements,
            localizeImages,
            processCodeBlocks
        },
        bulk: {
            modalTitle: "ChatGPT 批量导出",
            preparingMessage: "准备请求 ChatGPT 会话列表...",
            emptyMessage: "没有找到可导出的 ChatGPT 会话",
            completeMessage: "ChatGPT 批量导出完成",
            failurePrefix: "ChatGPT 批量导出失败",
            getConversations,
            getTitle,
            getDetail,
            toMarkdown
        },
        maintenance: {
            getAllConversationsForUnarchive,
            unarchiveConversation
        },
        download: {
            folder: "chatgpt-bulk-export"
        }
    });
})(globalThis);
