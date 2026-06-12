(function(global) {
    function getElements() {
        const result = [];
        const userQueries = document.querySelectorAll('user-query-content');
        const modelResponses = document.querySelectorAll('model-response');

        for (let i = 0; i < userQueries.length; i++) {
            result.push(userQueries[i]);
            if (i < modelResponses.length) {
                result.push(modelResponses[i]);
            }
        }

        return result;
    }

    function processCodeBlocks(doc) {
        doc.querySelectorAll('code-block').forEach(div => {
            const codeType = div.querySelector('div > div > span')?.textContent || '';
            const markdownCode = div.querySelector('div > div:nth-child(2) > div > pre')?.textContent || div.textContent;
            div.innerHTML = `\n\`\`\`${codeType}\n${markdownCode}\n\`\`\``;
        });
    }

    async function getConversations(context) {
        const pageSize = 50;
        const conversations = [];
        const seen = new Set();
        let cursor = null;

        while (!context.shouldStop()) {
            context.log(`请求 Gemini 列表: cursor=${cursor || '初始'}`);
            const payload = JSON.stringify([pageSize, cursor, [0, null, 1]]);
            const data = await fetchBatchExecute("MaZiqc", payload, "/search", context);
            const items = getConversationItems(data);

            items.forEach(item => {
                if (!item.id || seen.has(item.id)) return;
                seen.add(item.id);
                conversations.push(item);
            });

            const nextCursor = getConversationListCursor(data);
            if (!nextCursor || nextCursor === cursor || !items.length) break;
            cursor = nextCursor;
            await context.randomDelayBetweenRequests();
        }

        return conversations;
    }

    function getTitle(conversation) {
        return conversation.title || `gemini-${conversation.id}`;
    }

    function getDetail(conversation, context) {
        const payload = JSON.stringify([conversation.id, 10, null, 1, [0], [4], null, 1]);
        return fetchBatchExecute("hNvQHb", payload, `/app/${conversation.id}`, context);
    }

    async function toMarkdown(detail, meta, context) {
        const conversation = meta.conversation;
        const title = conversation?.title || conversation?.id || "Gemini Conversation";
        const turns = extractTurns(detail);
        let markdown = `# ${title}\n\n`;
        markdown += "- source: gemini\n";

        if (conversation?.createTime) {
            markdown += `- 创建时间: ${formatGeminiTime(conversation.createTime, context)}\n`;
        }
        markdown += "\n---\n";

        for (let index = 0; index < turns.length; index++) {
            const turn = turns[index];
            if (turn.user) {
                markdown += `\n# 用户问题\n${turn.user}\n`;
            }
            if (turn.userImages.length) {
                markdown += await imagesToMarkdown(turn.userImages, meta.imagePrefix, `turn-${index + 1}-user`, context);
            }
            if (turn.assistant) {
                markdown += `\n# 回答\n${turn.assistant}\n`;
            }
            if (turn.assistantImages.length) {
                markdown += await imagesToMarkdown(turn.assistantImages, meta.imagePrefix, `turn-${index + 1}-assistant`, context);
            }
        }

        return markdown.replace(/\n{3,}/g, '\n\n').trim() + '\n';
    }

    function getConversationItems(data) {
        const rawItems = Array.isArray(data?.[2]) ? data[2] : [];
        return rawItems
            .filter(item => Array.isArray(item) && typeof item[0] === 'string')
            .map(item => ({
                id: item[0],
                title: typeof item[1] === 'string' && item[1].trim() ? item[1].trim() : item[0],
                createTime: item[5]
            }));
    }

    function getConversationListCursor(data) {
        return typeof data?.[1] === 'string' && data[1] ? data[1] : null;
    }

    async function fetchBatchExecute(rpcId, payload, sourcePath, context) {
        const runtimeParams = getRuntimeParams();
        const query = new URLSearchParams({
            rpcids: rpcId,
            "source-path": sourcePath,
            bl: runtimeParams.bl,
            "f.sid": runtimeParams.fsid,
            hl: navigator.language || "zh-CN",
            _reqid: String(Math.floor(Math.random() * 900000) + 100000),
            rt: "c"
        });
        const body = new URLSearchParams();
        body.set("f.req", JSON.stringify([[[rpcId, payload, null, "generic"]]]));
        body.set("at", runtimeParams.at);

        const startedAt = Date.now();
        const response = await fetch(`/_/BardChatUi/data/batchexecute?${query.toString()}`, {
            method: "POST",
            credentials: "include",
            headers: {
                "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
                "x-same-domain": "1"
            },
            body: body.toString()
        });
        const text = await response.text();

        context.log(`Gemini ${rpcId} 响应: HTTP ${response.status}, ${Date.now() - startedAt}ms`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return parseBatchExecuteResponse(text, rpcId);
    }

    function getRuntimeParams() {
        const html = document.documentElement.innerHTML;
        const bl = readRuntimeValue(html, "cfb2h", "bl");
        const fsid = readRuntimeValue(html, "FdrFJe", "f.sid");
        const at = readRuntimeValue(html, "SNlM0e", "at");

        if (!bl || !fsid || !at) {
            throw new Error("无法读取 Gemini 请求参数，请刷新 Gemini 页面后重试");
        }

        return {bl, fsid, at};
    }

    function readRuntimeValue(html, dataKey, queryKey) {
        const patterns = [
            new RegExp(`"${dataKey}"\\s*:\\s*"([^"]+)"`),
            new RegExp(`\\["${dataKey}"\\s*,\\s*"([^"]+)"\\]`),
            new RegExp(`${queryKey.replace('.', '\\.')}=([^"&]+)`)
        ];

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match?.[1]) return decodeURIComponent(match[1].replace(/\\u003d/g, '='));
        }

        const input = document.querySelector(`input[name="${queryKey}"]`);
        return input?.value || null;
    }

    function parseBatchExecuteResponse(text, rpcId) {
        const jsonLines = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('['));

        for (const line of jsonLines) {
            let entries;
            try {
                entries = JSON.parse(line);
            } catch (error) {
                continue;
            }

            for (const entry of entries) {
                if (entry?.[0] !== "wrb.fr" || entry?.[1] !== rpcId) continue;
                if (typeof entry[2] !== "string") {
                    throw new Error(`Gemini ${rpcId} 响应缺少数据`);
                }
                return JSON.parse(entry[2]);
            }
        }

        throw new Error(`无法解析 Gemini ${rpcId} 响应`);
    }

    function extractTurns(detail) {
        const turnContainer = Array.isArray(detail?.[0]) ? detail[0] : [];
        return turnContainer
            .filter(isTurn)
            .map(turn => ({
                user: extractUserText(turn[2]).trim(),
                assistant: extractAssistantText(turn[3]).trim(),
                userImages: extractImages(turn[2]),
                assistantImages: extractImages(turn[3])
            }))
            .filter(turn => turn.user || turn.assistant || turn.userImages.length || turn.assistantImages.length);
    }

    function isTurn(value) {
        return Array.isArray(value)
            && Array.isArray(value[0])
            && typeof value[0][0] === 'string'
            && value[0][0].startsWith('c_');
    }

    function extractUserText(value) {
        const promptParts = Array.isArray(value?.[0]) ? value[0] : [];
        return promptParts.filter(part => typeof part === 'string').join('\n\n');
    }

    function extractAssistantText(value) {
        const candidateParts = value?.[0]?.[0]?.[1];
        if (Array.isArray(candidateParts)) {
            return candidateParts.filter(part => typeof part === 'string').join('\n\n');
        }
        return findLongestText(value);
    }

    function findLongestText(value) {
        const strings = [];
        collectStrings(value, strings);
        return strings
            .filter(text => text.length > 20 && !/^c_|^r_|^rc_/.test(text))
            .sort((a, b) => b.length - a.length)[0] || '';
    }

    function collectStrings(value, strings) {
        if (typeof value === 'string') {
            strings.push(value);
            return;
        }
        if (!Array.isArray(value)) return;
        value.forEach(item => collectStrings(item, strings));
    }

    function extractImages(value) {
        const images = [];
        const seen = new Set();

        collectImageSources(value, images, seen);
        return images;
    }

    function collectImageSources(value, images, seen) {
        if (!value) return;

        if (typeof value === 'string') {
            extractImageUrlsFromString(value).forEach(url => addImageSource(url, images, seen));
            return;
        }

        if (Array.isArray(value)) {
            const imageMetadata = parseImageMetadata(value);
            if (imageMetadata) {
                addImageSource(imageMetadata.source, images, seen, imageMetadata);
            }
            value.forEach(item => collectImageSources(item, images, seen));
            return;
        }

        if (typeof value !== 'object') return;

        ['url', 'imageUrl', 'image_url', 'thumbnailUrl', 'thumbnail_url', 'src'].forEach(key => {
            if (typeof value[key] === 'string') {
                addImageSource(value[key], images, seen);
            }
        });

        Object.keys(value).forEach(key => collectImageSources(value[key], images, seen));
    }

    function parseImageMetadata(value) {
        if (!Array.isArray(value) || value.length < 4) return null;

        const fileName = typeof value[2] === 'string' && isLikelyImageFilename(value[2]) ? value[2] : '';
        const source = typeof value[3] === 'string' ? normalizeImageSource(value[3]) : '';
        if (!fileName || !source || !isLikelyImageUrl(source)) return null;

        const mimeType = value.find(item => typeof item === 'string' && /^image\//i.test(item)) || '';
        const dimensions = value.find(item => Array.isArray(item)
            && item.length >= 2
            && item.every(part => typeof part === 'number'));

        return {
            source,
            fileName,
            mimeType,
            width: dimensions?.[0] || null,
            height: dimensions?.[1] || null,
            byteSize: dimensions?.[2] || null
        };
    }

    function extractImageUrlsFromString(text) {
        if (!text) return [];
        const urls = [];
        const dataUrlMatch = text.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/);
        if (dataUrlMatch) return [text];

        const urlPattern = /https?:\/\/[^\s"'<>\\]+/g;
        let match;
        while ((match = urlPattern.exec(text)) !== null) {
            const url = match[0].replace(/[),.;\]]+$/g, '');
            if (isLikelyImageUrl(url)) {
                urls.push(url);
            }
        }
        return urls;
    }

    function addImageSource(source, images, seen, metadata = {}) {
        const normalized = normalizeImageSource(source);
        if (!normalized || !isLikelyImageUrl(normalized) || seen.has(normalized)) return;
        if (isLikelyIconImage(normalized, metadata)) return;
        seen.add(normalized);
        images.push({
            source: normalized,
            fileName: metadata.fileName || '',
            mimeType: metadata.mimeType || '',
            width: metadata.width || null,
            height: metadata.height || null,
            byteSize: metadata.byteSize || null
        });
    }

    function normalizeImageSource(source) {
        if (!source || typeof source !== 'string') return '';
        if (/^data:image\//i.test(source)) return source;
        if (/^https?:\/\//i.test(source)) return source;
        if (source.startsWith('//')) return `${window.location.protocol}${source}`;
        if (source.startsWith('/')) return new URL(source, window.location.origin).href;
        return '';
    }

    function isLikelyImageUrl(url) {
        if (/^data:image\//i.test(url)) return true;
        if (/\.(png|jpe?g|gif|webp|bmp|svg|avif)(?:[?#]|$)/i.test(url)) return true;

        try {
            const parsed = new URL(url);
            const hostname = parsed.hostname.toLowerCase();
            const pathname = parsed.pathname.toLowerCase();

            if (pathname.includes('/image_generation_content/')) return false;

            return hostname.endsWith('googleusercontent.com')
                || hostname.includes('gstatic.com')
                || hostname.includes('ggpht.com')
                || hostname.includes('googleapis.com');
        } catch (error) {
            return false;
        }
    }

    function isLikelyIconImage(url, metadata = {}) {
        const width = Number(metadata.width) || 0;
        const height = Number(metadata.height) || 0;
        if (width > 0 && height > 0 && width <= 96 && height <= 96) return true;

        if (/^data:image\//i.test(url)) return false;

        try {
            const parsed = new URL(url);
            const hostname = parsed.hostname.toLowerCase();
            const pathname = decodeURIComponent(parsed.pathname).toLowerCase();
            const combined = `${hostname}${pathname}`;

            if (/\/(?:favicons?|icons?|logos?|branding)\//i.test(pathname)) return true;
            if (/(?:^|[._/-])(?:favicon|icon|logo|sprite|materialsymbols|material-icons)(?:[._/-]|$)/i.test(combined)) return true;
            if (/\/images\/branding\//i.test(pathname)) return true;

            const hasFileMetadata = Boolean(metadata.fileName || metadata.mimeType || metadata.width || metadata.height);
            if (!hasFileMetadata && /\.svg(?:[?#]|$)/i.test(pathname)) return true;

            return hostname === 'www.gstatic.com' && /\.svg(?:[?#]|$)/i.test(pathname);
        } catch (error) {
            return false;
        }
    }

    function isLikelyImageFilename(fileName) {
        return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(fileName);
    }

    async function imagesToMarkdown(images, imagePrefix, sectionName, context) {
        let markdown = '';

        for (let index = 0; index < images.length; index++) {
            const imageMarkdown = await downloadImage(images[index], imagePrefix, sectionName, index, context);
            if (imageMarkdown) {
                markdown += `${imageMarkdown}\n`;
            }
        }

        return markdown ? `\n${markdown}` : '';
    }

    async function downloadImage(image, imagePrefix, sectionName, index, context) {
        const source = typeof image === 'string' ? image : image.source;
        const originalFileName = typeof image === 'string' ? '' : image.fileName;
        const mimeType = typeof image === 'string' ? '' : image.mimeType;
        const extension = getImageExtension(source, originalFileName, mimeType) || 'png';
        const imageFilename = `${context.sanitizeFilename(imagePrefix || 'gemini')}-${sectionName}-${index + 1}.${extension}`;
        const relativePath = `images/${imageFilename}`;

        try {
            if (/^data:image\//i.test(source)) {
                await context.downloadDataUrlFile(source, relativePath);
            } else if (isSameOriginUrl(source)) {
                const blob = await fetchBlob(source);
                const dataUrl = await context.blobToDataUrl(blob);
                await context.downloadDataUrlFile(dataUrl, relativePath);
            } else {
                await context.downloadUrlFile(source, relativePath);
            }

            context.log(`已下载 Gemini 图片: ${relativePath}`);
            return `![${originalFileName || 'image'}](${relativePath})`;
        } catch (error) {
            context.log(`Gemini 图片下载失败: ${source} - ${error.message}`);
            return `![${originalFileName || 'image'}](${source})`;
        }
    }

    async function fetchBlob(url) {
        const response = await fetch(url, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return response.blob();
    }

    function isSameOriginUrl(url) {
        try {
            return new URL(url, window.location.href).origin === window.location.origin;
        } catch (error) {
            return false;
        }
    }

    function getImageExtension(source, fileName = '', mimeType = '') {
        if (mimeType) {
            const mimeExtension = mimeType.split('/')[1]?.split(';')[0]?.toLowerCase().replace('+xml', '');
            if (mimeExtension) return mimeExtension === 'jpeg' ? 'jpg' : mimeExtension;
        }

        if (fileName) {
            const fileMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
            if (fileMatch) return fileMatch[1].toLowerCase();
        }

        if (/^data:image\//i.test(source)) {
            const mimeMatch = source.match(/^data:image\/([^;]+)/i);
            const mimeExtension = mimeMatch?.[1]?.toLowerCase().replace('+xml', '');
            return mimeExtension === 'jpeg' ? 'jpg' : mimeExtension;
        }

        try {
            const pathname = new URL(source).pathname;
            const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
            return match?.[1]?.toLowerCase();
        } catch (error) {
            return '';
        }
    }

    function formatGeminiTime(value, context) {
        if (Array.isArray(value) && typeof value[0] === 'number') {
            return new Date(value[0] * 1000).toLocaleString();
        }
        return context.formatTime(value);
    }

    global.AI_EXPORT_PROVIDERS.registerProvider({
        id: "gemini",
        name: "Gemini",
        page: {
            getElements,
            preserveRenderedMath: true,
            processCodeBlocks
        },
        bulk: {
            modalTitle: "Gemini 批量导出",
            preparingMessage: "准备请求 Gemini 会话列表...",
            emptyMessage: "没有找到可导出的 Gemini 会话",
            completeMessage: "Gemini 批量导出完成",
            failurePrefix: "Gemini 批量导出失败",
            getConversations,
            getTitle,
            getDetail,
            toMarkdown
        },
        download: {
            folder: "gemini-bulk-export"
        }
    });
})(globalThis);
