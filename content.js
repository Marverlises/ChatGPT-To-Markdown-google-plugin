/**
 * @Author Ye bv
 * @Time 2024/2/8 15:02
 * @Description
 */

// 全局变量，用于跟踪按钮显示状态
let shouldShowExportButton = true;
let isGrok = false;
let isGemini = false;

// Global storage for multi-conversation export data (stored in memory, not serialized)
// This avoids the issue of Blob objects being lost during message passing or chrome.storage
let multiExportData = {
    exportedConversations: [],
    errors: []
};
let isChatGPT = false;

// IndexedDB helper functions for storing large data (avoids chrome.storage quota limits)
const DB_NAME = 'ChatExportDB';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

async function saveConversationToDB(conversationData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(conversationData);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveErrorToDB(errorData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add({ type: 'error', ...errorData });

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllFromDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function clearDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
// 监听来自 popup.js 的消息，实现按下按钮后导出或复制聊天记录
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "exportChatAsMarkdown") {
        exportChatAsZip();
    }
    if (request.action === "copyChatAsMarkdown") {
        copyChatAsMarkdown();
    }
    if (request.action === "toggleExportButton") {
        shouldShowExportButton = request.show;
        toggleExportButtonVisibility();
        sendResponse({success: true});
    }
    // 新增：查询当前按钮状态
    if (request.action === "getButtonStatus") {
        sendResponse({show: shouldShowExportButton});
    }

    // NEW: Get conversation list
    if (request.action === "getConversationList") {
        const conversations = getConversationList();
        sendResponse({ success: true, conversations: conversations });
    }

    // NEW: Export current conversation (for multi-export)
    if (request.action === "exportCurrentConversation") {
        exportCurrentConversationData(request.conversationInfo)
            .then(async result => {
                try {
                    if (result.success) {
                        console.log(`[Export] Processing result for: ${request.conversationInfo.title}`);

                        // Store Blobs directly in IndexedDB (no need to convert to ArrayBuffer)
                        // IndexedDB supports Blob objects natively
                        const exportItem = {
                            type: 'conversation',
                            conversation: request.conversationInfo,
                            data: {
                                markdown: result.data.markdown,
                                images: result.data.images  // Store Blobs directly
                            }
                        };

                        // Save to IndexedDB instead of chrome.storage
                        await saveConversationToDB(exportItem);

                        console.log(`[Export] ✓ Saved conversation "${request.conversationInfo.title}" to IndexedDB`);
                        sendResponse({ success: true });
                    } else {
                        console.error(`[Export] ✗ Export failed for "${request.conversationInfo.title}": ${result.error}`);

                        // Save error to IndexedDB
                        await saveErrorToDB({
                            conversation: request.conversationInfo,
                            error: result.error
                        });

                        sendResponse({ success: false, error: result.error });
                    }
                } catch (processingError) {
                    console.error(`[Export] ✗ Error processing export for "${request.conversationInfo.title}":`, processingError);

                    // Save error to IndexedDB
                    try {
                        await saveErrorToDB({
                            conversation: request.conversationInfo,
                            error: processingError.message
                        });
                    } catch (dbError) {
                        console.error('[Export] Failed to save error to DB:', dbError);
                    }

                    sendResponse({ success: false, error: processingError.message });
                }
            })
            .catch(async error => {
                console.error(`[Export] ✗ Catch block - Error exporting "${request.conversationInfo.title}":`, error);

                // Save error to IndexedDB
                try {
                    await saveErrorToDB({
                        conversation: request.conversationInfo,
                        error: error.message || String(error)
                    });
                } catch (dbError) {
                    console.error('[Export] Failed to save error to DB:', dbError);
                }

                sendResponse({ success: false, error: error.message || String(error) });
            });
        return true; // Async response
    }

    // NEW: Create multi-conversation ZIP
    if (request.action === "createMultiConversationZip") {
        // Read from IndexedDB
        getAllFromDB()
            .then(async allData => {
                console.log(`[ZIP] Retrieved ${allData.length} items from IndexedDB`);

                // Separate conversations and errors
                const exportedData = allData
                    .filter(item => item.type === 'conversation')
                    .map(item => ({
                        conversation: item.conversation,
                        data: item.data  // Blobs are already in the correct format
                    }));

                const errors = allData
                    .filter(item => item.type === 'error')
                    .map(item => ({
                        conversation: item.conversation,
                        error: item.error
                    }));

                console.log(`[ZIP] Creating ZIP with ${exportedData.length} conversations and ${errors.length} errors`);

                await createMultiConversationZip(exportedData, errors);

                // Clear IndexedDB after creating ZIP
                await clearDB();
                console.log('[ZIP] Cleared IndexedDB');

                sendResponse({ success: true });
            })
            .catch(error => {
                console.error('[ZIP] Error reading from IndexedDB:', error);
                alert(`Failed to create ZIP: ${error.message}`);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Async response
    }

    // NEW: Reset multi-export data (when starting new export)
    if (request.action === "resetMultiExportData") {
        clearDB()
            .then(() => {
                console.log('[Reset] Cleared IndexedDB');
                sendResponse({ success: true });
            })
            .catch(error => {
                console.error('[Reset] Error clearing IndexedDB:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Async response
    }

    return true; // 保持消息通道开放，以便异步响应
});

// 在页面加载完成后执行
window.onload = () => {
    // 默认创建按钮
    createExportButton();

    // 定时检查并重新插入按钮（如果应该显示）
    setInterval(() => {
        if (shouldShowExportButton && !document.getElementById('export-chat')) {
            createExportButton();
        } else if (!shouldShowExportButton && document.getElementById('export-chat')) {
            document.getElementById('export-chat').remove();
        }
    }, 1000); // 每秒检查一次
};

// 切换导出按钮的可见性
function toggleExportButtonVisibility() {
    const existingButton = document.getElementById('export-chat');

    if (shouldShowExportButton) {
        // 如果应该显示按钮但不存在，则创建它
        if (!existingButton) {
            createExportButton();
        }
    } else {
        // 如果不应该显示按钮但存在，则移除它
        if (existingButton) {
            existingButton.remove();
        }
    }
}

// 获取对话内容的元素
function getConversationElements() {
    const currentUrl = window.location.href;
    if (currentUrl.includes("openai.com") || currentUrl.includes("chatgpt.com")) {
        // ChatGPT 的对话选择器 - Select all message containers
        isChatGPT = true;
        return document.querySelectorAll('div[data-message-id]');
    } else if (currentUrl.includes("grok.com")) {
        // Grok 的对话选择器：选择所有消息泡泡 (Keep as is, verify if Grok changed)
        isGrok = true;
        return document.querySelectorAll('div.message-bubble');
    } else if (currentUrl.includes("gemini.google.com")) {
        // Gemini 的对话选择器：选择所有消息容器 —— infinite-scroller 下的第一个div
        isGemini = true;
        result = [];
        // 取出所有的 user-query-content 和 model-response
        const userQueries = document.querySelectorAll('user-query-content');
        const modelResponses = document.querySelectorAll('model-response');
        // 按照顺序将 user-query-content 和 model-response 组合成一对
        for (let i = 0; i < userQueries.length; i++) {
            if (i < modelResponses.length) {
                result.push(userQueries[i]);
                result.push(modelResponses[i]);
            } else {
                result.push(userQueries[i]);
            }
        }
        return result;
    }
    return [];
}

// 复制聊天记录为 Markdown 格式
function copyChatAsMarkdown() {
    let markdownContent = "";
    let allElements = getConversationElements();

    for (let i = 0; i < allElements.length; i += 2) {
        if (!allElements[i + 1]) break; // 防止越界
        let userText = allElements[i].textContent.trim();
        let answerHtml = allElements[i + 1].innerHTML.trim();

        userText = htmlToMarkdown(userText);
        answerHtml = htmlToMarkdown(answerHtml);

        markdownContent += `\n# 用户问题\n${userText}\n# 回答\n${answerHtml}`;
    }

    markdownContent = markdownContent.replace(/&amp;/g, '&');
    if (!markdownContent) {
        console.log("未找到对话内容");
        return;
    }

    // 检查是否已经存在模态框
    if (document.getElementById('markdown-modal')) return;

    // 创建模态背景
    const modal = document.createElement('div');
    modal.id = 'markdown-modal';
    Object.assign(modal.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '1000'
    });

    // 创建模态内容容器
    const modalContent = document.createElement('div');
    Object.assign(modalContent.style, {
        backgroundColor: '#fff',
        color: '#000',
        padding: '20px',
        borderRadius: '8px',
        width: '50%',
        height: '80%',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        overflow: 'hidden'
    });

    // 创建文本区域
    const textarea = document.createElement('textarea');
    textarea.value = markdownContent;
    Object.assign(textarea.style, {
        flex: '1',
        resize: 'none',
        width: '100%',
        padding: '10px',
        fontSize: '14px',
        fontFamily: 'monospace',
        marginBottom: '10px',
        boxSizing: 'border-box',
        color: '#000',
        backgroundColor: '#f9f9f9',
        border: '1px solid #ccc',
        borderRadius: '4px'
    });
    textarea.setAttribute('readonly', true);

    // 创建按钮容器
    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, {
        display: 'flex',
        justifyContent: 'flex-end'
    });

    // 创建复制按钮
    const copyButton = document.createElement('button');
    copyButton.textContent = '复制';
    Object.assign(copyButton.style, {
        padding: '8px 16px',
        fontSize: '14px',
        cursor: 'pointer',
        backgroundColor: '#28A745',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        marginRight: '10px'
    });

    // 创建关闭按钮
    const closeButton = document.createElement('button');
    closeButton.textContent = '关闭';
    Object.assign(closeButton.style, {
        padding: '8px 16px',
        fontSize: '14px',
        cursor: 'pointer',
        backgroundColor: '#007BFF',
        color: '#fff',
        border: 'none',
        borderRadius: '4px'
    });

    buttonContainer.appendChild(copyButton);
    buttonContainer.appendChild(closeButton);
    modalContent.appendChild(textarea);
    modalContent.appendChild(buttonContainer);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    textarea.focus();

    copyButton.addEventListener('click', () => {
        textarea.select();
        navigator.clipboard.writeText(textarea.value)
            .then(() => {
                copyButton.textContent = '已复制';
                setTimeout(() => {
                    copyButton.textContent = '复制';
                }, 2000);
            })
            .catch(err => console.error('复制失败', err));
    });

    closeButton.addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    const escListener = (e) => {
        if (e.key === 'Escape' && document.getElementById('markdown-modal')) {
            document.body.removeChild(modal);
            document.removeEventListener('keydown', escListener);
        }
    };
    document.addEventListener('keydown', escListener);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
            document.removeEventListener('keydown', escListener);
        }
    });
}

// 创建导出按钮
function createExportButton() {
    const exportButton = document.createElement('button');
    exportButton.textContent = 'Export Chat';
    exportButton.id = 'export-chat';
    const styles = {
        position: 'fixed',
        height: '36px',
        top: '10px',
        right: '35%',
        zIndex: '10000',
        padding: '10px',
        backgroundColor: '#4cafa3',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        textAlign: 'center',
        lineHeight: '16px'
    };
    document.body.appendChild(exportButton);
    Object.assign(exportButton.style, styles);
    exportButton.addEventListener('click', exportChatAsZip);
}

// 导出聊天记录为带图片的 ZIP 格式
async function exportChatAsZip() {
    console.log('开始导出聊天记录（含图片）...');

    let markdownContent = "";
    let allImages = []; // 收集所有图片
    let allElements = getConversationElements();

    console.log(`[导出] 找到 ${allElements.length} 个对话元素`);

    // 遍历对话元素，收集markdown内容和图片
    for (let i = 0; i < allElements.length; i += 2) {
        if (!allElements[i + 1]) break; // 防止越界
        let userHtml = allElements[i].innerHTML.trim();
        let answerHtml = allElements[i + 1].innerHTML.trim();

        console.log(`[导出] 处理对话 ${i/2 + 1}:`);
        console.log(`  用户HTML (前200字符): ${userHtml.substring(0, 200)}`);
        console.log(`  回答HTML (前200字符): ${answerHtml.substring(0, 200)}`);
        console.log(`  用户HTML包含<img>: ${userHtml.includes('<img')}`);
        console.log(`  回答HTML包含<img>: ${answerHtml.includes('<img')}`);

        // 用户问题也可能包含图片（粘贴的图片），使用图片收集模式
        const userResult = htmlToMarkdown(userHtml, true);
        let userMarkdown;

        if (typeof userResult === 'object') {
            userMarkdown = userResult.markdown;
            allImages = allImages.concat(userResult.images);
        } else {
            userMarkdown = userResult;
        }

        // 回答可能包含图片，使用图片收集模式
        const answerResult = htmlToMarkdown(answerHtml, true);
        let answerMarkdown;

        if (typeof answerResult === 'object') {
            // 返回的是对象，包含markdown和images
            answerMarkdown = answerResult.markdown;
            allImages = allImages.concat(answerResult.images);
        } else {
            // 返回的是字符串（兼容性处理）
            answerMarkdown = answerResult;
        }

        markdownContent += `\n# 用户问题\n${userMarkdown}\n# 回答\n${answerMarkdown}`;
    }

    // 统一重新编号所有图片，确保序号连续且不重复
    // 需要按照图片在markdown中出现的顺序来编号，而不是按照收集的顺序

    // 创建一个临时映射，记录每个临时路径在markdown中第一次出现的位置
    const imagePositions = allImages.map(img => ({
        image: img,
        firstPosition: markdownContent.indexOf(img.localPath)
    }));

    // 按照在markdown中出现的位置排序
    imagePositions.sort((a, b) => a.firstPosition - b.firstPosition);

    // 按照排序后的顺序重新编号
    imagePositions.forEach((item, index) => {
        const img = item.image;
        const extension = img.extension || img.filename.split('.').pop();
        const newFilename = `image_${String(index + 1).padStart(3, '0')}.${extension}`;
        const newLocalPath = `./images/${newFilename}`;

        // 替换markdown中的旧临时路径为新的正式路径
        // 因为临时路径是唯一的，所以不会有替换错误的问题
        markdownContent = markdownContent.replace(img.localPath, newLocalPath);

        // 更新图片对象为最终的文件名
        img.filename = newFilename;
        img.localPath = newLocalPath;
    });
    markdownContent = markdownContent.replace(/&amp;/g, '&');

    if (!markdownContent) {
        console.log("未找到对话内容");
        alert("未找到对话内容");
        return;
    }

    console.log(`找到 ${allImages.length} 张图片`);

    try {
        // 下载所有图片
        const downloadedImages = await downloadImages(allImages);

        // 创建ZIP文件
        const zipBlob = await createZipFile(markdownContent, downloadedImages);

        // 下载ZIP文件
        download(zipBlob, 'chat-export.zip', 'application/zip');

        console.log('✓ 导出完成！');
        alert(`导出成功！包含 ${downloadedImages.length} 张图片`);
    } catch (error) {
        console.error('导出失败:', error);
        alert('导出失败，请查看控制台了解详情');
    }
}

// 下载函数
function download(data, filename, type) {
    var file = new Blob([data], {type: type});
    if (window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveOrOpenBlob(file, filename);
    } else {
        var a = document.createElement('a'),
            url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    }
}

// 将 HTML 转换为 Markdown
function htmlToMarkdown(html, collectImages = false) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 图片收集数组（仅在导出时使用）
    const imageList = [];

    // 1. 处理公式
    // FIXME: Gemini 公式处理时渲染使用html前端渲染控制角标等，所以行内公式只能按照文本格式显示
    if (!isGemini) {
        doc.querySelectorAll('span.katex-html').forEach(element => element.remove());
    }
    doc.querySelectorAll('mrow').forEach(mrow => mrow.remove());
    doc.querySelectorAll('annotation[encoding="application/x-tex"]').forEach(element => {
        if (element.closest('.katex-display')) {
            const latex = element.textContent;
            // 删除latex两边的空格
            const trimmedLatex = latex.trim();
            element.replaceWith(`\n$$\n${trimmedLatex}\n$$\n`);
        } else {
            const latex = element.textContent;
            const trimmedLatex = latex.trim();
            element.replaceWith(`$${trimmedLatex}$`);
        }
    });

    // 2. 加粗处理
    doc.querySelectorAll('strong, b').forEach(bold => {
        const markdownBold = `**${bold.textContent}**`;
        bold.parentNode.replaceChild(document.createTextNode(markdownBold), bold);
    });

    // 3. 斜体处理
    doc.querySelectorAll('em, i').forEach(italic => {
        const markdownItalic = `*${italic.textContent}*`;
        italic.parentNode.replaceChild(document.createTextNode(markdownItalic), italic);
    });

    // 4. 行内代码处理
    doc.querySelectorAll('p code').forEach(code => {
        const markdownCode = `\`${code.textContent}\``;
        code.parentNode.replaceChild(document.createTextNode(markdownCode), code);
    });

    // 5. 链接处理
    doc.querySelectorAll('a').forEach(link => {
        const markdownLink = `[${link.textContent}](${link.href})`;
        link.parentNode.replaceChild(document.createTextNode(markdownLink), link);
    });

    // 6. 处理图片
    const imgElements = doc.querySelectorAll('img');
    if (collectImages) {
        console.log(`[图片收集] 在HTML片段中找到 ${imgElements.length} 个img标签`);
    }

    imgElements.forEach((img, index) => {
        if (collectImages) {
            // 收集图片信息用于下载
            const imageUrl = img.src;
            const imageAlt = img.alt || `image_${String(index + 1).padStart(3, '0')}`;

            console.log(`[图片收集] 图片 ${index + 1}: ${imageUrl.substring(0, 100)}...`);

            // 从URL中提取文件扩展名，默认为png
            let extension = 'png';
            const urlMatch = imageUrl.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
            if (urlMatch) {
                extension = urlMatch[1].toLowerCase();
            }

            // 使用唯一的临时标识符，避免重复路径导致替换错误
            const uniqueId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const tempImageName = `${uniqueId}.${extension}`;
            const tempLocalPath = `./images/${tempImageName}`;

            imageList.push({
                url: imageUrl,
                alt: imageAlt,
                filename: tempImageName, // 临时文件名，后续会统一重新编号
                localPath: tempLocalPath,
                extension: extension // 保存扩展名用于后续重命名
            });

            // 使用临时路径替换（确保唯一性）
            const markdownImage = `![${imageAlt}](${tempLocalPath})`;
            img.parentNode.replaceChild(document.createTextNode(markdownImage), img);
        } else {
            // 原有逻辑：直接使用URL
            const markdownImage = `![${img.alt}](${img.src})`;
            img.parentNode.replaceChild(document.createTextNode(markdownImage), img);
        }
    });

    // 7. 代码块处理
    if (isChatGPT) {
        doc.querySelectorAll('pre').forEach(pre => {
            const codeType = pre.querySelector('div > div:first-child')?.textContent || '';
            const markdownCode = pre.querySelector('div > div:nth-child(3) > code')?.textContent || pre.textContent;
            pre.innerHTML = `\n\`\`\`${codeType}\n${markdownCode}\n\`\`\``;
        });
    } else if (isGrok) {
        // 控制台打印
        // 选择 class="not-prose" 的 div
        doc.querySelectorAll('div.not-prose').forEach(div => {

            // 获取第一个子元素的文本内容
            const codeType = div.querySelector('div > div > span')?.textContent || '';
            // 获取第三个子元素的文本内容
            const markdownCode = div.querySelector('div > div:nth-child(3) > code')?.textContent || div.textContent;
            // 替换内容
            div.innerHTML = `\n\`\`\`${codeType}\n${markdownCode}\n\`\`\``;
        });
    } else if (isGemini) {
        // 取出class="code-block“
        doc.querySelectorAll('code-block').forEach(div => {
            const codeType = div.querySelector('div > div > span')?.textContent || '';
            const markdownCode = div.querySelector('div > div:nth-child(2) > div > pre')?.textContent || div.textContent;
            div.innerHTML = `\n\`\`\`${codeType}\n${markdownCode}\n\`\`\``;
        });
    }

    // 8. 处理列表
    doc.querySelectorAll('ul').forEach(ul => {
        let markdown = '';
        ul.querySelectorAll(':scope > li').forEach(li => {
            markdown += `- ${li.textContent.trim()}\n`;
        });
        ul.parentNode.replaceChild(document.createTextNode('\n' + markdown.trim()), ul);
    });

    doc.querySelectorAll('ol').forEach(ol => {
        let markdown = '';
        ol.querySelectorAll(':scope > li').forEach((li, index) => {
            markdown += `${index + 1}. ${li.textContent.trim()}\n`;
        });
        ol.parentNode.replaceChild(document.createTextNode('\n' + markdown.trim()), ol);
    });

    // 9. 标题处理
    for (let i = 1; i <= 6; i++) {
        doc.querySelectorAll(`h${i}`).forEach(header => {
            const markdownHeader = '\n' + `${'#'.repeat(i)} ${header.textContent}\n`;
            header.parentNode.replaceChild(document.createTextNode(markdownHeader), header);
        });
    }

    // 10. 段落处理
    doc.querySelectorAll('p').forEach(p => {
        const markdownParagraph = '\n' + p.textContent + '\n';
        p.parentNode.replaceChild(document.createTextNode(markdownParagraph), p);
    });

    // 11. 表格处理
    doc.querySelectorAll('table').forEach(table => {
        let markdown = '';
        table.querySelectorAll('thead tr').forEach(tr => {
            tr.querySelectorAll('th').forEach(th => {
                markdown += `| ${th.textContent} `;
            });
            markdown += '|\n';
            tr.querySelectorAll('th').forEach(() => {
                markdown += '| ---- ';
            });
            markdown += '|\n';
        });
        table.querySelectorAll('tbody tr').forEach(tr => {
            tr.querySelectorAll('td').forEach(td => {
                markdown += `| ${td.textContent} `;
            });
            markdown += '|\n';
        });
        table.parentNode.replaceChild(document.createTextNode('\n' + markdown.trim() + '\n'), table);
    });

    // 12. 处理引用块（只能处理一级引用，不能处理嵌套引用）
    doc.querySelectorAll('blockquote').forEach(blockquote => {
        const lines = blockquote.textContent.trim().split('\n');
        const markdownQuote = lines.map(line => `> ${line.trim()}`).join('\n');
        blockquote.parentNode.replaceChild(document.createTextNode('\n' + markdownQuote + '\n'), blockquote);
    });

    let markdown = doc.body.textContent || '';

    // 根据collectImages参数返回不同格式
    if (collectImages) {
        return {
            markdown: markdown.trim(),
            images: imageList
        };
    } else {
        return markdown.trim();
    }

    // let markdown = doc.body.innerHTML.replace(/<[^>]*>/g, '');
    // markdown = markdown.replaceAll(/- &gt;/g, '- $\\gt$');
    // markdown = markdown.replaceAll(/>/g, '>');
    // markdown = markdown.replaceAll(/</g, '<');
    // markdown = markdown.replaceAll(/≥/g, '>=');
    // markdown = markdown.replaceAll(/≤/g, '<=');
    // markdown = markdown.replaceAll(/≠/g, '\\neq');

    // return markdown.trim();
}

// 异步下载图片列表
async function downloadImages(imageList) {
    const downloadedImages = [];

    for (let i = 0; i < imageList.length; i++) {
        const imageInfo = imageList[i];
        try {
            console.log(`下载图片 ${i + 1}/${imageList.length}: ${imageInfo.url}`);

            // 使用fetch下载图片
            const response = await fetch(imageInfo.url);
            if (!response.ok) {
                console.error(`下载失败 (${response.status}): ${imageInfo.url}`);
                continue;
            }

            // 转换为Blob
            const blob = await response.blob();

            console.log(`Blob info for ${imageInfo.filename}:`, {
                type: blob.type,
                size: blob.size,
                constructor: blob.constructor.name,
                isBlob: blob instanceof Blob
            });

            downloadedImages.push({
                filename: imageInfo.filename,
                blob: blob,
                localPath: imageInfo.localPath
            });

            console.log(`✓ 下载成功: ${imageInfo.filename}`);
        } catch (error) {
            console.error(`下载图片失败: ${imageInfo.url}`, error);
            // 继续下载其他图片，不中断整个流程
        }
    }

    console.log(`图片下载完成: ${downloadedImages.length}/${imageList.length}`);
    return downloadedImages;
}

// 创建包含markdown和图片的ZIP文件
async function createZipFile(markdownContent, downloadedImages) {
    console.log('创建ZIP文件...');

    // 创建JSZip实例
    const zip = new JSZip();

    // 添加markdown文件
    zip.file('chat-export.md', markdownContent);
    console.log('✓ 添加markdown文件');

    // 如果有图片，创建images文件夹并添加图片
    if (downloadedImages.length > 0) {
        const imagesFolder = zip.folder('images');

        for (const image of downloadedImages) {
            imagesFolder.file(image.filename, image.blob);
            console.log(`✓ 添加图片: ${image.filename}`);
        }

        console.log(`✓ 共添加 ${downloadedImages.length} 张图片`);
    }

    // 生成ZIP文件的Blob
    const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
            level: 6
        }
    });

    console.log('✓ ZIP文件创建完成');
    return zipBlob;
}

/**
 * Sanitize filename to remove invalid characters
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename) {
    return filename
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 100); // Limit length
}

/**
 * Get all conversation links from ChatGPT sidebar
 * @returns {Array} Array of {title, url, id} objects
 */
function getConversationList() {
    const currentUrl = window.location.href;
    const conversations = [];

    console.log('Getting conversation list from:', currentUrl);

    if (currentUrl.includes("openai.com") || currentUrl.includes("chatgpt.com")) {
        // Strategy 1: Find all links that match conversation URL pattern
        console.log('Strategy 1: Searching for a[href*="/c/"]...');
        const links = document.querySelectorAll('a[href*="/c/"]');
        console.log(`Found ${links.length} links with /c/ pattern`);

        links.forEach(link => {
            const href = link.href;
            const match = href.match(/\/c\/([a-zA-Z0-9-]+)/);

            if (match) {
                const id = match[1];
                // Get title from link text or aria-label
                let title = link.textContent.trim();

                // Try multiple methods to get title
                if (!title || title.length < 2) {
                    title = link.getAttribute('aria-label') || '';
                }
                if (!title || title.length < 2) {
                    title = link.getAttribute('title') || '';
                }
                if (!title || title.length < 2) {
                    // Try to get text from child elements
                    const divs = link.querySelectorAll('div');
                    for (const div of divs) {
                        const text = div.textContent.trim();
                        if (text && text.length > 2) {
                            title = text;
                            break;
                        }
                    }
                }
                if (!title || title.length < 2) {
                    title = `Conversation ${id.substring(0, 8)}`;
                }

                console.log(`Found conversation: ${title} (${id})`);

                conversations.push({
                    id: id,
                    url: href,
                    title: sanitizeFilename(title)
                });
            }
        });

        // Strategy 2: Try alternative selectors if no results
        if (conversations.length === 0) {
            console.log("Strategy 1 failed, trying alternative selectors...");
            const navItems = document.querySelectorAll('nav li a, aside li a');
            navItems.forEach(link => {
                const href = link.href;
                const match = href.match(/\/c\/([a-zA-Z0-9-]+)/);

                if (match) {
                    const id = match[1];
                    const title = link.textContent.trim() ||
                                  link.getAttribute('aria-label') ||
                                  `Conversation ${id.substring(0, 8)}`;

                    conversations.push({
                        id: id,
                        url: href,
                        title: sanitizeFilename(title)
                    });
                }
            });
        }

        // Strategy 3: Fallback - any links with conversation pattern
        if (conversations.length === 0) {
            console.log("Strategy 2 failed, trying fallback...");
            const allLinks = document.querySelectorAll('a');
            allLinks.forEach(link => {
                const href = link.href;
                if (/\/c\/[a-zA-Z0-9-]+/.test(href)) {
                    const match = href.match(/\/c\/([a-zA-Z0-9-]+)/);
                    if (match) {
                        const id = match[1];
                        const title = link.textContent.trim() ||
                                      link.getAttribute('aria-label') ||
                                      `Conversation ${id.substring(0, 8)}`;

                        conversations.push({
                            id: id,
                            url: href,
                            title: sanitizeFilename(title)
                        });
                    }
                }
            });
        }
    }

    // Remove duplicates based on ID
    const uniqueConversations = Array.from(
        new Map(conversations.map(c => [c.id, c])).values()
    );

    console.log(`Found ${uniqueConversations.length} unique conversations`);

    if (uniqueConversations.length === 0) {
        console.error('No conversations found!');
        console.error('Current URL:', window.location.href);
        console.error('Total links on page:', document.querySelectorAll('a').length);
        console.error('Links with /c/:', document.querySelectorAll('a[href*="/c/"]').length);

        // Debug: log all links
        const allLinks = document.querySelectorAll('a');
        console.log('Sample links (first 10):');
        for (let i = 0; i < Math.min(10, allLinks.length); i++) {
            console.log(`  ${i + 1}. ${allLinks[i].href} - "${allLinks[i].textContent.trim().substring(0, 50)}"`);
        }
    }

    return uniqueConversations;
}

/**
 * Check if current page is a conversation page
 * @returns {boolean} True if on conversation page
 */
function isConversationPage() {
    const url = window.location.href;
    return url.match(/\/c\/[a-zA-Z0-9-]+/) !== null;
}

/**
 * Get current conversation ID
 * @returns {string|null} Conversation ID or null
 */
function getCurrentConversationId() {
    const match = window.location.href.match(/\/c\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
}

/**
 * Export current conversation and return data (for multi-export)
 * Does not download, just returns the data
 * @param {Object} conversationInfo - Conversation metadata {id, title, url}
 * @returns {Promise<Object>} Export result with success status and data
 */
async function exportCurrentConversationData(conversationInfo) {
    console.log(`Exporting conversation: ${conversationInfo.title}`);

    try {
        let markdownContent = "";
        let allImages = [];
        let allElements = getConversationElements();

        console.log(`Found ${allElements.length} conversation elements`);

        if (allElements.length === 0) {
            throw new Error("No conversation elements found");
        }

        // Process conversation elements (same as exportChatAsZip)
        for (let i = 0; i < allElements.length; i += 2) {
            if (!allElements[i + 1]) break;

            let userHtml = allElements[i].innerHTML.trim();
            let answerHtml = allElements[i + 1].innerHTML.trim();

            const userResult = htmlToMarkdown(userHtml, true);
            let userMarkdown;
            if (typeof userResult === 'object') {
                userMarkdown = userResult.markdown;
                allImages = allImages.concat(userResult.images);
            } else {
                userMarkdown = userResult;
            }

            const answerResult = htmlToMarkdown(answerHtml, true);
            let answerMarkdown;
            if (typeof answerResult === 'object') {
                answerMarkdown = answerResult.markdown;
                allImages = allImages.concat(answerResult.images);
            } else {
                answerMarkdown = answerResult;
            }

            markdownContent += `\n# 用户问题\n${userMarkdown}\n# 回答\n${answerMarkdown}`;
        }

        // Re-number images
        const imagePositions = allImages.map(img => ({
            image: img,
            firstPosition: markdownContent.indexOf(img.localPath)
        }));

        imagePositions.sort((a, b) => a.firstPosition - b.firstPosition);

        imagePositions.forEach((item, index) => {
            const img = item.image;
            const extension = img.extension || img.filename.split('.').pop();
            const newFilename = `image_${String(index + 1).padStart(3, '0')}.${extension}`;
            const newLocalPath = `./images/${newFilename}`;

            markdownContent = markdownContent.replace(new RegExp(img.localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newLocalPath);

            img.filename = newFilename;
            img.localPath = newLocalPath;
        });

        markdownContent = markdownContent.replace(/&amp;/g, '&');

        // Download images
        console.log(`Downloading ${allImages.length} images...`);
        const downloadedImages = await downloadImages(allImages);
        console.log(`Downloaded ${downloadedImages.length} images successfully`);

        // Verify image data structure
        if (downloadedImages.length > 0) {
            console.log('Sample image data:', {
                filename: downloadedImages[0].filename,
                blobType: downloadedImages[0].blob?.constructor?.name,
                blobSize: downloadedImages[0].blob?.size,
                hasLocalPath: !!downloadedImages[0].localPath
            });
        }

        const result = {
            success: true,
            data: {
                markdown: markdownContent,
                images: downloadedImages,
                conversationInfo: conversationInfo
            }
        };

        console.log(`Returning result with ${downloadedImages.length} images`);
        return result;

    } catch (error) {
        console.error('Export failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Create multi-conversation ZIP file
 * @param {Array} exportedData - Array of exported conversation data
 * @param {Array} errors - Array of error objects
 */
async function createMultiConversationZip(exportedData, errors) {
    console.log(`Creating multi-conversation ZIP with ${exportedData.length} conversations`);

    try {
        const zip = new JSZip();
        console.log('JSZip instance created');

        // Add README
        let readmeContent = `# Multi-Conversation Export\n\n`;
        readmeContent += `Export Date: ${new Date().toLocaleString()}\n`;
        readmeContent += `Total Conversations: ${exportedData.length}\n`;

        if (errors.length > 0) {
            readmeContent += `\n## Errors (${errors.length})\n`;
            errors.forEach((err, idx) => {
                readmeContent += `${idx + 1}. ${err.conversation.title}: ${err.error}\n`;
            });
        }

        readmeContent += `\n## Conversations\n`;
        exportedData.forEach((item, idx) => {
            readmeContent += `${idx + 1}. ${item.conversation.title}\n`;
        });

        zip.file('README.txt', readmeContent);
        console.log('README.txt added');

        // Add each conversation
        for (let i = 0; i < exportedData.length; i++) {
            try {
                const item = exportedData[i];
                console.log(`Adding conversation ${i + 1}: ${item.conversation.title}`);

                // Validate data structure
                if (!item.data || !item.data.markdown) {
                    console.error(`Invalid data structure for conversation ${i + 1}:`, item);
                    continue;
                }

                const folderName = `conversation_${String(i + 1).padStart(3, '0')}_${item.conversation.title}`;
                const conversationFolder = zip.folder(folderName);
                console.log(`Created folder: ${folderName}`);

                // Add markdown file
                conversationFolder.file('conversation.md', item.data.markdown);
                console.log(`Added markdown file for conversation ${i + 1}`);

                // Add images if any
                if (item.data.images && item.data.images.length > 0) {
                    const imagesFolder = conversationFolder.folder('images');
                    console.log(`Adding ${item.data.images.length} images for conversation ${i + 1}`);

                    for (let j = 0; j < item.data.images.length; j++) {
                        const image = item.data.images[j];
                        console.log(`Processing image ${j + 1}:`, {
                            filename: image?.filename,
                            blobType: image?.blob?.constructor?.name,
                            blobSize: image?.blob?.size,
                            hasLocalPath: !!image?.localPath
                        });

                        if (image && image.blob && image.filename) {
                            // Verify blob is actually a Blob object
                            if (!(image.blob instanceof Blob)) {
                                console.error(`Image blob is not a Blob instance for ${image.filename}:`, typeof image.blob);
                                continue;
                            }

                            try {
                                imagesFolder.file(image.filename, image.blob);
                                console.log(`✓ Added image: ${image.filename}`);
                            } catch (imgError) {
                                console.error(`Failed to add image ${image.filename}:`, imgError);
                            }
                        } else {
                            console.warn(`Invalid image data at index ${j}:`, {
                                hasImage: !!image,
                                hasBlob: !!image?.blob,
                                hasFilename: !!image?.filename
                            });
                        }
                    }
                }
            } catch (itemError) {
                console.error(`Error adding conversation ${i + 1}:`, itemError);
                // Continue with next conversation
            }
        }

        console.log('Starting ZIP generation...');

        // Generate ZIP
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });

        console.log(`ZIP blob generated, size: ${zipBlob.size} bytes`);

        // Download
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const filename = `multi-chat-export_${timestamp}.zip`;

        console.log(`Downloading ZIP as: ${filename}`);
        download(zipBlob, filename, 'application/zip');

        console.log('Multi-conversation export complete!');

        let alertMessage = `Successfully exported ${exportedData.length} conversations!`;
        if (errors.length > 0) {
            alertMessage += `\n\n⚠️ ${errors.length} errors occurred:\n`;
            errors.forEach((err, idx) => {
                alertMessage += `${idx + 1}. ${err.conversation.title}\n   Error: ${err.error}\n`;
            });
            alertMessage += `\nCheck the README.txt in the ZIP file for details.`;
        }
        alert(alertMessage);

    } catch (error) {
        console.error('Failed to create multi-conversation ZIP:', error);
        console.error('Error stack:', error.stack);
        console.error('Exported data:', exportedData);
        alert(`Failed to create ZIP file.\nError: ${error.message}\nCheck console for details.`);
    }
}
