/**
 * @Author allen (based on yebv)
 * @Time 2024/2/8 15:02
 * @Description
 */

// 全局变量，用于跟踪按钮显示状态
let shouldShowExportButton = true;
const siteRegistry = globalThis.AI_EXPORT_SITES;
const providerRegistry = globalThis.AI_EXPORT_PROVIDERS;

// 批量导出状态
let bulkExportModal = null;
let bulkExportProgress = null;
let bulkExportLog = null;
let bulkExportRunning = false;
let bulkExportPaused = false;
let bulkExportStopped = false;
let bulkExportPauseButton = null;
const BULK_EXPORT_RETRY_DELAY_MS = 3 * 60 * 1000;
const BULK_EXPORT_MAX_CONSECUTIVE_FAILURES = 3;

// One-off ChatGPT unarchive state.
let chatGPTUnarchiveRunning = false;
let chatGPTUnarchivePaused = false;
let chatGPTUnarchiveStopped = false;
let chatGPTUnarchiveModal = null;
let chatGPTUnarchiveProgress = null;
let chatGPTUnarchiveLog = null;
let chatGPTUnarchivePauseButton = null;
let chatGPTUnarchiveStopButton = null;
let chatGPTUnarchiveResumeResolver = null;
const CHATGPT_UNARCHIVE_MAX_CONSECUTIVE_FAILURES = 3;
const CHATGPT_UNARCHIVE_RETRY_MIN_MS = 60 * 1000;
const CHATGPT_UNARCHIVE_RETRY_MAX_MS = 3 * 60 * 1000;

console.log("[ChatGPT to Markdown] content script loaded", window.location.hostname, getCurrentSite()?.id || "unsupported");

function getCurrentSite() {
    return siteRegistry?.getSiteByUrl(window.location.href) || null;
}

function getCurrentSiteId() {
    return getCurrentSite()?.id || "";
}

function getCurrentSiteName() {
    return getCurrentSite()?.name || "当前网站";
}

function getCurrentProviderId() {
    const site = getCurrentSite();
    return site?.provider || site?.id || "";
}

function getSiteByBulkExportAction(action) {
    return siteRegistry?.sites?.find(site => site.bulkExportAction === action) || null;
}

// 监听来自 popup.js 的消息，实现按下按钮后导出或复制聊天记录
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "exportChatAsMarkdown") {
        exportChatAsMarkdown();
        sendResponse({success: true});
        return false;
    }
    if (request.action === "unarchiveAllChatGPTConversations") {
        if (getCurrentSiteId() !== "chatgpt") {
            sendResponse({success: false, error: "Current tab is not a ChatGPT page"});
            return false;
        }

        if (chatGPTUnarchiveRunning) {
            if (chatGPTUnarchivePaused) {
                resumeChatGPTUnarchiveTask();
                sendResponse({success: true, message: "Unarchive task resumed"});
                return false;
            }

            sendResponse({success: false, error: "ChatGPT unarchive task is already running"});
            return false;
        }

        unarchiveAllChatGPTConversations().catch(error => {
            console.error("[ChatGPT Unarchive] failed to start", error);
            sendChatGPTUnarchiveLog(`Failed to start unarchive: ${error.message}`, "error", "failed");
            chatGPTUnarchiveRunning = false;
            chatGPTUnarchivePaused = false;
            chatGPTUnarchiveStopped = false;
        });
        sendResponse({success: true, message: "ChatGPT unarchive task started"});
        return false;
    }
    const bulkExportSite = getSiteByBulkExportAction(request.action);
    if (bulkExportSite) {
        const providerId = bulkExportSite.provider || bulkExportSite.id;
        const provider = providerRegistry?.getProviderById(providerId);
        if (getCurrentSiteId() !== bulkExportSite.id) {
            sendResponse({success: false, error: `当前标签页不是 ${bulkExportSite.name} 页面`});
            return false;
        }
        if (!provider?.bulk) {
            sendResponse({success: false, error: `${bulkExportSite.name} 暂不支持批量导出`});
            return false;
        }
        if (bulkExportRunning) {
            sendResponse({success: false, error: `${bulkExportSite.name} 批量导出已在运行`});
            return false;
        }
        console.log(`[${bulkExportSite.name} Bulk Export] start requested`, {source: request.source || "unknown"});
        exportAllConversationsWithProvider(provider).catch(error => {
            console.error(`[${bulkExportSite.name} Bulk Export] failed to start`, error);
            createBulkExportModal(provider.bulk.modalTitle || `${bulkExportSite.name} 批量导出`);
            updateBulkExportProgress(`${bulkExportSite.name} 批量导出启动失败: ${error.message}`);
            bulkExportRunning = false;
            bulkExportPaused = false;
            bulkExportStopped = false;
            updateBulkExportControls();
        });
        sendResponse({success: true, message: `${bulkExportSite.name} 批量导出已开始`});
        return false;
    }
    if (request.action === "copyChatAsMarkdown") {
        copyChatAsMarkdown();
        sendResponse({success: true});
        return false;
    }
    if (request.action === "toggleExportButton") {
        shouldShowExportButton = request.show;
        toggleExportButtonVisibility();
        sendResponse({success: true});
        return false;
    }
    // 新增：查询当前按钮状态
    if (request.action === "getButtonStatus") {
        sendResponse({show: shouldShowExportButton});
        return false;
    }
    return false;
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
    }, 1000);
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
    return getCurrentConversationProvider()?.page?.getElements?.() || [];
}

function getCurrentConversationProvider() {
    return providerRegistry?.getProviderById(getCurrentProviderId()) || null;
}

function getCurrentSourceType() {
    return getCurrentSiteId();
}

// 复制聊天记录为 Markdown 格式
async function copyChatAsMarkdown() {
    const markdownContent = await buildCurrentPageMarkdown({includeSourceMeta: false});
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
    exportButton.addEventListener('click', exportChatAsMarkdown);
}

// 导出聊天记录为 Markdown 格式
async function exportChatAsMarkdown() {
    const exportFilename = getCurrentChatExportFilename();
    const markdownContent = await buildCurrentPageMarkdown({
        exportFilename,
        includeSourceMeta: true
    });

    if (markdownContent) {
        download(markdownContent, exportFilename, 'text/markdown');
    } else {
        console.log("未找到对话内容");
    }
}

async function buildCurrentPageMarkdown(options = {}) {
    const provider = getCurrentConversationProvider();
    const page = provider?.page;
    if (!page) return "";

    let markdownContent = "";
    const allElements = Array.from(getConversationElements());
    const imagePrefix = (options.exportFilename || getCurrentChatExportFilename()).replace(/\.md$/i, '');

    for (let i = 0; i < allElements.length; i += 2) {
        if (!allElements[i + 1]) break;
        let userHtml = allElements[i].innerHTML.trim();
        let answerHtml = allElements[i + 1].innerHTML.trim();

        if (page.localizeImages) {
            const context = createProviderContext(provider);
            userHtml = await page.localizeImages(userHtml, imagePrefix, `user-${i + 1}`, context);
            answerHtml = await page.localizeImages(answerHtml, imagePrefix, `answer-${i + 2}`, context);
        }

        const userText = htmlToMarkdown(userHtml, provider);
        const answerText = htmlToMarkdown(answerHtml, provider);
        markdownContent += `\n# 用户问题\n${userText}\n# 回答\n${answerText}`;
    }

    markdownContent = markdownContent.replace(/&amp;/g, '&').trim();
    if (!markdownContent) return "";

    if (options.includeSourceMeta !== false) {
        const source = getCurrentSourceType();
        if (source) {
            markdownContent = `- source: ${source}\n\n---\n${markdownContent}`;
        }
    }

    return markdownContent;
}

async function exportAllProviderConversations(providerId) {
    const provider = providerRegistry?.getProviderById(providerId);
    if (!provider?.bulk) {
        alert(`${providerId} 暂不支持批量导出`);
        return;
    }

    return exportAllConversationsWithProvider(provider);
}

async function exportAllConversationsWithProvider(provider) {
    if (bulkExportRunning) return;
    if (getCurrentProviderId() !== provider.id) {
        const siteName = siteRegistry?.getSiteById(provider.id)?.name || provider.name || provider.id;
        alert(`批量导出只能在 ${siteName} 页面使用`);
        return;
    }

    const context = createProviderContext(provider);
    const bulk = provider.bulk;
    bulkExportRunning = true;
    bulkExportPaused = false;
    bulkExportStopped = false;
    createBulkExportModal(bulk.modalTitle || `${provider.name || provider.id} 批量导出`);
    updateBulkExportProgress(bulk.preparingMessage || `准备请求 ${provider.name || provider.id} 会话列表...`);

    try {
        const conversations = await bulk.getConversations(context);
        if (!conversations.length) {
            updateBulkExportProgress(bulk.emptyMessage || `没有找到可导出的 ${provider.name || provider.id} 会话`);
            return;
        }

        addBulkExportLog(`找到 ${conversations.length} 个会话，开始依次导出。`);
        let consecutiveExportFailures = 0;

        for (let i = 0; i < conversations.length; i++) {
            if (bulkExportStopped) {
                updateBulkExportProgress("批量导出已停止");
                return;
            }

            await waitForBulkExportResume();

            if (bulkExportStopped) {
                updateBulkExportProgress("批量导出已停止");
                return;
            }

            const conversation = conversations[i];
            const displayIndex = i + 1;
            const conversationTitle = bulk.getTitle?.(conversation, displayIndex, context)
                || conversation?.title
                || `${provider.id}-${conversation?.id || displayIndex}`;
            updateBulkExportProgress(`正在导出 ${displayIndex}/${conversations.length}: ${conversationTitle}`);

            while (!bulkExportStopped) {
                try {
                    const filename = `${sanitizeFilename(conversationTitle)}.md`;
                    const imagePrefix = filename.replace(/\.md$/i, '');
                    const detail = bulk.getDetail
                        ? await bulk.getDetail(conversation, context)
                        : conversation;
                    const markdown = await bulk.toMarkdown(detail, {
                        conversation,
                        displayIndex,
                        title: conversationTitle,
                        filename,
                        imagePrefix
                    }, context);
                    addBulkExportLog(`准备下载文件: ${filename}`);
                    await download(markdown, filename, 'text/markdown', {
                        allowFallback: false,
                        folder: provider.download?.folder
                    });
                    addBulkExportLog(`已导出: ${filename}`);
                    consecutiveExportFailures = 0;
                    await randomDelayBetweenRequests();
                    break;
                } catch (error) {
                    consecutiveExportFailures += 1;
                    addBulkExportLog(`导出失败 ${consecutiveExportFailures}/${BULK_EXPORT_MAX_CONSECUTIVE_FAILURES}: ${conversationTitle} - ${error.message}`);

                    if (consecutiveExportFailures >= BULK_EXPORT_MAX_CONSECUTIVE_FAILURES) {
                        bulkExportPaused = true;
                        updateBulkExportControls();
                        updateBulkExportProgress(`连续 ${BULK_EXPORT_MAX_CONSECUTIVE_FAILURES} 次导出失败，已暂停后续所有请求，请检查后点击继续`);
                        await waitForBulkExportResume();
                        if (bulkExportStopped) {
                            updateBulkExportProgress("批量导出已停止");
                            return;
                        }
                        consecutiveExportFailures = 0;
                        continue;
                    }

                    updateBulkExportProgress(`导出失败，休眠 3 分钟后重试: ${conversationTitle}`);
                    await waitForBulkExportRetryDelay(BULK_EXPORT_RETRY_DELAY_MS);
                    await waitForBulkExportResume();
                }
            }
        }

        updateBulkExportProgress(bulk.completeMessage || `${provider.name || provider.id} 批量导出完成`);
    } catch (error) {
        updateBulkExportProgress(`${bulk.failurePrefix || `${provider.name || provider.id} 批量导出失败`}: ${error.message}`);
    } finally {
        bulkExportRunning = false;
        bulkExportPaused = false;
        bulkExportStopped = false;
        updateBulkExportControls();
    }
}

async function unarchiveAllChatGPTConversations() {
    const provider = providerRegistry?.getProviderById("chatgpt");
    const maintenance = provider?.maintenance;

    if (!maintenance?.getAllConversationsForUnarchive || !maintenance?.unarchiveConversation) {
        throw new Error("Current ChatGPT provider does not support unarchive");
    }

    chatGPTUnarchiveRunning = true;
    chatGPTUnarchivePaused = false;
    chatGPTUnarchiveStopped = false;
    createChatGPTUnarchiveModal();
    sendChatGPTUnarchiveLog("Fetching all ChatGPT conversations...", "info", "running");

    const context = createChatGPTUnarchiveContext(provider);

    try {
        let consecutiveFailures = 0;
        let conversations = [];

        while (!chatGPTUnarchiveStopped) {
            try {
                conversations = await maintenance.getAllConversationsForUnarchive(context);
                consecutiveFailures = 0;
                break;
            } catch (error) {
                consecutiveFailures += 1;
                sendChatGPTUnarchiveLog(`Failed to fetch conversation list ${consecutiveFailures}/${CHATGPT_UNARCHIVE_MAX_CONSECUTIVE_FAILURES}: ${error.message}`, "error", "running");

                if (consecutiveFailures >= CHATGPT_UNARCHIVE_MAX_CONSECUTIVE_FAILURES) {
                    chatGPTUnarchivePaused = true;
                    sendChatGPTUnarchiveLog(`${CHATGPT_UNARCHIVE_MAX_CONSECUTIVE_FAILURES} consecutive list fetch failures. Paused. Check login/network, then click the button again to resume.`, "error", "paused");
                    await waitForChatGPTUnarchiveResume();
                    consecutiveFailures = 0;
                    continue;
                }

                await randomChatGPTUnarchiveRetryDelay();
            }
        }

        if (chatGPTUnarchiveStopped) {
            sendChatGPTUnarchiveLog("ChatGPT unarchive stopped", "info", "stopped");
            return;
        }

        if (!conversations.length) {
            sendChatGPTUnarchiveLog("No ChatGPT conversations found", "info", "completed");
            return;
        }

        sendChatGPTUnarchiveLog(`Found ${conversations.length} unique conversations. Starting unarchive requests.`, "info", "running");

        for (let i = 0; i < conversations.length; i++) {
            if (chatGPTUnarchiveStopped) {
                sendChatGPTUnarchiveLog("ChatGPT unarchive stopped", "info", "stopped");
                return;
            }

            const conversation = conversations[i];
            const title = provider.bulk?.getTitle?.(conversation, i + 1, context)
                || conversation?.title
                || conversation?.id
                || `conversation-${i + 1}`;

            await waitForChatGPTUnarchiveResume();

            if (chatGPTUnarchiveStopped) {
                sendChatGPTUnarchiveLog("ChatGPT unarchive stopped", "info", "stopped");
                return;
            }

            while (!chatGPTUnarchiveStopped) {
                try {
                    sendChatGPTUnarchiveLog(`Requesting ${i + 1}/${conversations.length}: ${title}`, "info", "running");
                    await maintenance.unarchiveConversation(conversation, context);
                    consecutiveFailures = 0;
                    sendChatGPTUnarchiveLog(`Unarchived: ${title}`, "info", "running");

                    if (i < conversations.length - 1) {
                        await randomChatGPTUnarchiveRequestDelay();
                    }
                    break;
                } catch (error) {
                    consecutiveFailures += 1;
                    sendChatGPTUnarchiveLog(`Request failed ${consecutiveFailures}/${CHATGPT_UNARCHIVE_MAX_CONSECUTIVE_FAILURES}: ${title} - ${error.message}`, "error", "running");

                    if (consecutiveFailures >= CHATGPT_UNARCHIVE_MAX_CONSECUTIVE_FAILURES) {
                        chatGPTUnarchivePaused = true;
                        sendChatGPTUnarchiveLog(`${CHATGPT_UNARCHIVE_MAX_CONSECUTIVE_FAILURES} consecutive failures. Paused. Check login/network, then click the button again to resume.`, "error", "paused");
                        await waitForChatGPTUnarchiveResume();
                        consecutiveFailures = 0;
                        continue;
                    }

                    await randomChatGPTUnarchiveRetryDelay();
                }
            }

            if (chatGPTUnarchiveStopped) {
                sendChatGPTUnarchiveLog("ChatGPT unarchive stopped", "info", "stopped");
                return;
            }
        }

        sendChatGPTUnarchiveLog("ChatGPT unarchive completed for all conversations", "info", "completed");
    } catch (error) {
        sendChatGPTUnarchiveLog(`ChatGPT unarchive failed: ${error.message}`, "error", "failed");
    } finally {
        chatGPTUnarchiveRunning = false;
        chatGPTUnarchivePaused = false;
        chatGPTUnarchiveStopped = false;
        chatGPTUnarchiveResumeResolver = null;
        updateChatGPTUnarchiveControls();
    }
}

function createChatGPTUnarchiveContext(provider) {
    return {
        provider,
        log: message => sendChatGPTUnarchiveLog(message, "info", "running"),
        shouldStop: () => chatGPTUnarchiveStopped,
        randomDelayBetweenRequests: randomChatGPTUnarchiveRequestDelay,
        sanitizeFilename,
        formatTime,
        htmlToMarkdown,
        blobToDataUrl
    };
}

function sendChatGPTUnarchiveLog(message, level = "info", state = "running") {
    const time = new Date().toLocaleTimeString();
    console.log(`[ChatGPT Unarchive] ${message}`);
    addChatGPTUnarchivePanelLog(message, level, state, time);
    chrome.runtime.sendMessage({
        action: "chatGPTUnarchiveLog",
        message,
        level,
        state,
        time
    }, () => {
        // Ignore lastError when the popup is closed.
        void chrome.runtime.lastError;
    });
}

function createChatGPTUnarchiveModal() {
    if (chatGPTUnarchiveModal) return;

    chatGPTUnarchiveModal = document.createElement('div');
    Object.assign(chatGPTUnarchiveModal.style, {
        position: 'fixed',
        right: '20px',
        bottom: '20px',
        width: '380px',
        maxHeight: '60vh',
        zIndex: '10002',
        padding: '16px',
        backgroundColor: '#fff',
        color: '#111',
        border: '1px solid #ddd',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        fontSize: '14px',
        fontFamily: 'Arial, sans-serif'
    });

    const title = document.createElement('div');
    title.textContent = 'ChatGPT Unarchive';
    Object.assign(title.style, {
        fontWeight: 'bold',
        marginBottom: '8px'
    });

    chatGPTUnarchiveProgress = document.createElement('div');
    chatGPTUnarchiveProgress.textContent = 'Waiting...';
    Object.assign(chatGPTUnarchiveProgress.style, {
        marginBottom: '8px'
    });

    chatGPTUnarchiveLog = document.createElement('div');
    Object.assign(chatGPTUnarchiveLog.style, {
        maxHeight: '300px',
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        padding: '8px',
        backgroundColor: '#f6f8fa',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'Menlo, Consolas, monospace',
        lineHeight: '1.4'
    });

    chatGPTUnarchivePauseButton = document.createElement('button');
    chatGPTUnarchivePauseButton.textContent = '暂停';
    Object.assign(chatGPTUnarchivePauseButton.style, {
        marginTop: '10px',
        marginRight: '8px',
        padding: '6px 12px',
        cursor: 'pointer',
        backgroundColor: '#ffc107',
        color: '#111',
        border: 'none',
        borderRadius: '4px'
    });
    chatGPTUnarchivePauseButton.addEventListener('click', () => {
        if (chatGPTUnarchivePaused) {
            resumeChatGPTUnarchiveTask();
            return;
        }

        pauseChatGPTUnarchiveTask();
    });

    chatGPTUnarchiveStopButton = document.createElement('button');
    chatGPTUnarchiveStopButton.textContent = '停止';
    Object.assign(chatGPTUnarchiveStopButton.style, {
        marginTop: '10px',
        marginRight: '8px',
        padding: '6px 12px',
        cursor: 'pointer',
        backgroundColor: '#dc3545',
        color: '#fff',
        border: 'none',
        borderRadius: '4px'
    });
    chatGPTUnarchiveStopButton.addEventListener('click', () => {
        if (!chatGPTUnarchiveRunning) return;
        chatGPTUnarchiveStopped = true;
        chatGPTUnarchivePaused = false;
        resolveChatGPTUnarchiveResumeWait();
        sendChatGPTUnarchiveLog("Stopping after the current request...", "info", "running");
        updateChatGPTUnarchiveControls();
    });

    const closeButton = document.createElement('button');
    closeButton.textContent = '关闭';
    Object.assign(closeButton.style, {
        marginTop: '10px',
        padding: '6px 12px',
        cursor: 'pointer',
        backgroundColor: '#007BFF',
        color: '#fff',
        border: 'none',
        borderRadius: '4px'
    });
    closeButton.addEventListener('click', () => {
        chatGPTUnarchiveModal.remove();
        chatGPTUnarchiveModal = null;
        chatGPTUnarchiveProgress = null;
        chatGPTUnarchiveLog = null;
        chatGPTUnarchivePauseButton = null;
        chatGPTUnarchiveStopButton = null;
    });

    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, {
        display: 'flex',
        alignItems: 'center'
    });
    buttonContainer.appendChild(chatGPTUnarchivePauseButton);
    buttonContainer.appendChild(chatGPTUnarchiveStopButton);
    buttonContainer.appendChild(closeButton);

    chatGPTUnarchiveModal.appendChild(title);
    chatGPTUnarchiveModal.appendChild(chatGPTUnarchiveProgress);
    chatGPTUnarchiveModal.appendChild(chatGPTUnarchiveLog);
    chatGPTUnarchiveModal.appendChild(buttonContainer);
    document.body.appendChild(chatGPTUnarchiveModal);
    updateChatGPTUnarchiveControls();
}

function addChatGPTUnarchivePanelLog(message, level, state, time) {
    createChatGPTUnarchiveModal();

    if (chatGPTUnarchiveProgress) {
        chatGPTUnarchiveProgress.textContent = message;
        chatGPTUnarchiveProgress.style.color = level === "error" ? '#b00020' : '#111';
    }

    if (chatGPTUnarchiveLog) {
        chatGPTUnarchiveLog.textContent += `[${time}] ${message}\n`;
        chatGPTUnarchiveLog.scrollTop = chatGPTUnarchiveLog.scrollHeight;
    }

    updateChatGPTUnarchiveControls(state);
}

function updateChatGPTUnarchiveControls(state) {
    const isDone = state === "completed" || state === "failed" || state === "stopped";

    if (chatGPTUnarchivePauseButton) {
        chatGPTUnarchivePauseButton.textContent = chatGPTUnarchivePaused ? '继续' : '暂停';
        chatGPTUnarchivePauseButton.disabled = !chatGPTUnarchiveRunning || chatGPTUnarchiveStopped || isDone;
        chatGPTUnarchivePauseButton.style.opacity = chatGPTUnarchivePauseButton.disabled ? '0.6' : '1';
    }

    if (chatGPTUnarchiveStopButton) {
        chatGPTUnarchiveStopButton.disabled = !chatGPTUnarchiveRunning || chatGPTUnarchiveStopped || isDone;
        chatGPTUnarchiveStopButton.style.opacity = chatGPTUnarchiveStopButton.disabled ? '0.6' : '1';
    }
}

function pauseChatGPTUnarchiveTask() {
    if (!chatGPTUnarchiveRunning || chatGPTUnarchiveStopped || chatGPTUnarchivePaused) return false;

    chatGPTUnarchivePaused = true;
    sendChatGPTUnarchiveLog("Unarchive task paused. Click continue to resume.", "info", "paused");
    updateChatGPTUnarchiveControls();
    return true;
}

function resumeChatGPTUnarchiveTask() {
    if (!chatGPTUnarchiveRunning) {
        sendChatGPTUnarchiveLog("No running unarchive task to resume", "error", "failed");
        return false;
    }

    if (!chatGPTUnarchivePaused) {
        sendChatGPTUnarchiveLog("Unarchive task is already running", "info", "running");
        return true;
    }

    chatGPTUnarchivePaused = false;
    resolveChatGPTUnarchiveResumeWait();
    sendChatGPTUnarchiveLog("Unarchive task resumed", "info", "running");
    updateChatGPTUnarchiveControls();
    return true;
}

function resolveChatGPTUnarchiveResumeWait() {
    if (!chatGPTUnarchiveResumeResolver) return;
    const resolve = chatGPTUnarchiveResumeResolver;
    chatGPTUnarchiveResumeResolver = null;
    resolve();
}

async function waitForChatGPTUnarchiveResume() {
    if (!chatGPTUnarchivePaused || chatGPTUnarchiveStopped) return;

    await new Promise(resolve => {
        chatGPTUnarchiveResumeResolver = resolve;
    });
}

async function randomChatGPTUnarchiveRequestDelay() {
    const ms = getRandomInt(1000, 5000);
    sendChatGPTUnarchiveLog(`Waiting ${(ms / 1000).toFixed(1)} seconds before the next request`, "info", "running");
    await waitForChatGPTUnarchiveDelay(ms);
}

async function randomChatGPTUnarchiveRetryDelay() {
    const ms = getRandomInt(CHATGPT_UNARCHIVE_RETRY_MIN_MS, CHATGPT_UNARCHIVE_RETRY_MAX_MS);
    sendChatGPTUnarchiveLog(`Request failed. Retrying after ${Math.ceil(ms / 1000)} seconds`, "error", "running");
    await waitForChatGPTUnarchiveDelay(ms);
}

async function waitForChatGPTUnarchiveDelay(ms) {
    const endAt = Date.now() + ms;

    while (!chatGPTUnarchiveStopped && Date.now() < endAt) {
        await waitForChatGPTUnarchiveResume();
        if (chatGPTUnarchiveStopped) return;

        const remainingMs = endAt - Date.now();
        if (remainingMs > 0) {
            await delay(Math.min(1000, remainingMs));
        }
    }
}

function createProviderContext(provider) {
    return {
        provider,
        log: addBulkExportLog,
        shouldStop: () => bulkExportStopped,
        randomDelayBetweenRequests,
        sanitizeFilename,
        formatTime,
        htmlToMarkdown,
        downloadUrlFile: (url, filename, folder = provider.download?.folder) => downloadUrlFile(url, filename, folder),
        downloadDataUrlFile: (dataUrl, filename, folder = provider.download?.folder) => downloadDataUrlFile(dataUrl, filename, folder),
        blobToDataUrl
    };
}

function downloadUrlFile(url, filename, folder) {
    return sendDownloadMessage({
        action: "downloadUrlFile",
        url,
        filename,
        folder
    });
}

function downloadDataUrlFile(dataUrl, filename, folder) {
    return sendDownloadMessage({
        action: "downloadDataUrlFile",
        dataUrl,
        filename,
        folder
    });
}

function sendDownloadMessage(payload) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(payload, response => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!response?.success) {
                reject(new Error(response?.error || 'Download failed'));
                return;
            }
            resolve(response);
        });
    });
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function createBulkExportModal(titleText = "ChatGPT 批量导出") {
    if (bulkExportModal) return;

    bulkExportModal = document.createElement('div');
    Object.assign(bulkExportModal.style, {
        position: 'fixed',
        right: '20px',
        bottom: '20px',
        width: '360px',
        maxHeight: '60vh',
        zIndex: '10001',
        padding: '16px',
        backgroundColor: '#fff',
        color: '#111',
        border: '1px solid #ddd',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        fontSize: '14px'
    });

    const title = document.createElement('div');
    title.textContent = titleText;
    Object.assign(title.style, {
        fontWeight: 'bold',
        marginBottom: '8px'
    });

    bulkExportProgress = document.createElement('div');
    bulkExportProgress.textContent = '等待开始...';
    Object.assign(bulkExportProgress.style, {
        marginBottom: '8px'
    });

    bulkExportLog = document.createElement('div');
    Object.assign(bulkExportLog.style, {
        maxHeight: '300px',
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        padding: '8px',
        backgroundColor: '#f6f8fa',
        borderRadius: '4px',
        fontSize: '12px'
    });

    const closeButton = document.createElement('button');
    closeButton.textContent = '关闭';
    Object.assign(closeButton.style, {
        marginTop: '10px',
        padding: '6px 12px',
        cursor: 'pointer',
        backgroundColor: '#007BFF',
        color: '#fff',
        border: 'none',
        borderRadius: '4px'
    });
    closeButton.addEventListener('click', () => {
        bulkExportModal.remove();
        bulkExportModal = null;
        bulkExportProgress = null;
        bulkExportLog = null;
        bulkExportPauseButton = null;
    });

    bulkExportPauseButton = document.createElement('button');
    bulkExportPauseButton.textContent = '暂停';
    Object.assign(bulkExportPauseButton.style, {
        marginTop: '10px',
        marginRight: '8px',
        padding: '6px 12px',
        cursor: 'pointer',
        backgroundColor: '#ffc107',
        color: '#111',
        border: 'none',
        borderRadius: '4px'
    });
    bulkExportPauseButton.addEventListener('click', () => {
        if (!bulkExportRunning) return;
        bulkExportPaused = !bulkExportPaused;
        updateBulkExportControls();
        updateBulkExportProgress(bulkExportPaused ? "批量导出已暂停" : "批量导出继续");
    });

    const stopButton = document.createElement('button');
    stopButton.textContent = '停止';
    Object.assign(stopButton.style, {
        marginTop: '10px',
        marginRight: '8px',
        padding: '6px 12px',
        cursor: 'pointer',
        backgroundColor: '#dc3545',
        color: '#fff',
        border: 'none',
        borderRadius: '4px'
    });
    stopButton.addEventListener('click', () => {
        if (!bulkExportRunning) return;
        bulkExportStopped = true;
        bulkExportPaused = false;
        updateBulkExportControls();
        updateBulkExportProgress("正在停止，当前请求完成后结束...");
    });

    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, {
        display: 'flex',
        alignItems: 'center'
    });
    buttonContainer.appendChild(bulkExportPauseButton);
    buttonContainer.appendChild(stopButton);
    buttonContainer.appendChild(closeButton);

    bulkExportModal.appendChild(title);
    bulkExportModal.appendChild(bulkExportProgress);
    bulkExportModal.appendChild(bulkExportLog);
    bulkExportModal.appendChild(buttonContainer);
    document.body.appendChild(bulkExportModal);
    updateBulkExportControls();
}

function updateBulkExportProgress(message) {
    if (bulkExportProgress) {
        bulkExportProgress.textContent = message;
    }
    addBulkExportLog(message);
}

function addBulkExportLog(message) {
    if (!bulkExportLog) return;
    const time = new Date().toLocaleTimeString();
    bulkExportLog.textContent += `[${time}] ${message}\n`;
    bulkExportLog.scrollTop = bulkExportLog.scrollHeight;
}

async function waitForBulkExportResume() {
    while (bulkExportPaused && !bulkExportStopped) {
        await delay(300);
    }
}

async function waitForBulkExportRetryDelay(ms) {
    const endAt = Date.now() + ms;
    while (!bulkExportStopped && Date.now() < endAt) {
        await waitForBulkExportResume();
        if (bulkExportStopped) return;
        const remainingMs = endAt - Date.now();
        if (remainingMs > 0) {
            await delay(Math.min(1000, remainingMs));
        }
    }
}

function updateBulkExportControls() {
    if (!bulkExportPauseButton) return;
    bulkExportPauseButton.textContent = bulkExportPaused ? '继续' : '暂停';
    bulkExportPauseButton.disabled = !bulkExportRunning || bulkExportStopped;
    bulkExportPauseButton.style.opacity = bulkExportPauseButton.disabled ? '0.6' : '1';
}

function sanitizeFilename(filename) {
    return filename
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || `${getCurrentSourceType() || 'ai'}-conversation`;
}

function formatTime(value) {
    const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
}

function getCurrentChatExportFilename() {
    const titleFromPage = document.querySelector('title')?.textContent || document.title || '';
    const siteNames = siteRegistry?.sites?.map(site => site.name).filter(Boolean) || ["ChatGPT", "Gemini", "Grok", "DeepSeek"];
    const title = siteNames.reduce((value, siteName) => {
        const escapedName = siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return value
            .replace(new RegExp(`\\s*[-|]\\s*${escapedName}\\s*$`, 'i'), '')
            .replace(new RegExp(`\\s*${escapedName}\\s*$`, 'i'), '');
    }, titleFromPage).trim();
    return `${sanitizeFilename(title || 'chat-export')}.md`;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

async function randomDelayBetweenRequests() {
    if (bulkExportStopped) return;
    const ms = 1000 + Math.floor(Math.random() * 4001);
    addBulkExportLog(`随机等待 ${(ms / 1000).toFixed(1)} 秒后继续请求`);
    await delay(ms);
}

// 下载函数
function download(data, filename, type, options = {}) {
    const allowFallback = options.allowFallback !== false;
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "downloadMarkdownFile",
            data,
            filename,
            folder: options.folder,
            mimeType: type
        }, response => {
            if (chrome.runtime.lastError || !response?.success) {
                const error = new Error(chrome.runtime.lastError?.message || response?.error || 'Download failed');
                console.log("Extension download failed:", error.message);
                if (!allowFallback) {
                    reject(error);
                    return;
                }
                try {
                    fallbackDownload(data, filename, type);
                    resolve();
                } catch (error) {
                    reject(error);
                }
                return;
            }
            resolve(response);
        });
    });
}

function fallbackDownload(data, filename, type) {
    const file = new Blob([data], {type: type});
    const a = document.createElement('a');
    const url = URL.createObjectURL(file);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 0);
}

// 将 HTML 转换为 Markdown
function htmlToMarkdown(html, provider = getCurrentConversationProvider()) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. 处理公式
    // FIXME: Gemini 公式处理时渲染使用html前端渲染控制角标等，所以行内公式只能按照文本格式显示
    if (!provider?.page?.preserveRenderedMath) {
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
    doc.querySelectorAll('img').forEach(img => {
        const markdownImage = `![${img.alt}](${img.src})`;
        img.parentNode.replaceChild(document.createTextNode(markdownImage), img);
    });

    // 7. 代码块处理
    provider?.page?.processCodeBlocks?.(doc);

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
    // 將連續 3 行以上空行壓縮成 2 行
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    return markdown.trim();

    // let markdown = doc.body.innerHTML.replace(/<[^>]*>/g, '');
    // markdown = markdown.replaceAll(/- &gt;/g, '- $\\gt$');
    // markdown = markdown.replaceAll(/>/g, '>');
    // markdown = markdown.replaceAll(/</g, '<');
    // markdown = markdown.replaceAll(/≥/g, '>=');
    // markdown = markdown.replaceAll(/≤/g, '<=');
    // markdown = markdown.replaceAll(/≠/g, '\\neq');

    // return markdown.trim();
}
