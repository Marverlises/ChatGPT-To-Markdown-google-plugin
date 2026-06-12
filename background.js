/**
 * @Author allen (based on yebv)
 * @Time 2024/2/8 15:02
 * @Description
 */
const chatGPTCapturedHeadersByTabId = {};
const pendingBulkExportTabs = {};
const pendingDownloadFilenames = [];

// 当插件安装或更新时触发
chrome.runtime.onInstalled.addListener(function() {
    console.log("ChatGPT Exporter 插件已安装或更新");
});

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    if (downloadItem.byExtensionId !== chrome.runtime.id) return;

    const filename = pendingDownloadFilenames.shift();
    if (!filename) return;

    console.log("[ChatGPT Bulk Export] force download filename", {
        downloadId: downloadItem.id,
        originalFilename: downloadItem.filename,
        suggestedFilename: filename
    });
    suggest({
        filename,
        conflictAction: "uniquify"
    });
});

chrome.webRequest.onBeforeSendHeaders.addListener(
    details => {
        const captured = extractChatGPTRequestHeaders(details);
        if (!captured.authorization && !captured.cookie) return;

        chatGPTCapturedHeadersByTabId[details.tabId] = {
            ...chatGPTCapturedHeadersByTabId[details.tabId],
            ...captured,
            url: details.url,
            capturedAt: Date.now()
        };

        console.log("[ChatGPT Bulk Export] captured page request headers", {
            tabId: details.tabId,
            url: details.url,
            hasAuthorization: Boolean(captured.authorization),
            hasCookie: Boolean(captured.cookie)
        });
    },
    {
        urls: [
            "https://chatgpt.com/*",
            "https://*.chatgpt.com/*"
        ]
    },
    ["requestHeaders", "extraHeaders"]
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== "complete" || !pendingBulkExportTabs[tabId]) return;

    setTimeout(() => {
        chrome.tabs.sendMessage(tabId, {
            action: "bulkExportChatGPTConversations",
            source: "background"
        }, () => {
            if (chrome.runtime.lastError) {
                console.log("Error starting bulk export after refresh:", chrome.runtime.lastError);
            }
        });
        delete pendingBulkExportTabs[tabId];
    }, 1500);
});

// 监听来自内容脚本和 popup 的消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === "exportChatHistory") {
        console.log("接收到导出聊天记录的请求");
    }

    if (message.action === "prepareAndStartBulkExport") {
        const tabId = message.tabId;
        if (typeof tabId !== "number") {
            sendResponse({success: false, error: "Invalid tabId"});
            return false;
        }

        delete chatGPTCapturedHeadersByTabId[tabId];
        pendingBulkExportTabs[tabId] = {startedAt: Date.now()};
        chrome.tabs.reload(tabId, {}, () => {
            if (chrome.runtime.lastError) {
                delete pendingBulkExportTabs[tabId];
                sendResponse({success: false, error: chrome.runtime.lastError.message});
                return;
            }
            sendResponse({success: true});
        });
        return true;
    }

    if (message.action === "getChatGPTCapturedHeaders") {
        const tabId = sender.tab?.id ?? message.tabId;
        const captured = chatGPTCapturedHeadersByTabId[tabId] || {};
        sendResponse({
            success: true,
            headers: {
                authorization: captured.authorization || null,
                cookie: captured.cookie || null
            },
            meta: {
                url: captured.url || null,
                capturedAt: captured.capturedAt || null,
                hasAuthorization: Boolean(captured.authorization),
                hasCookie: Boolean(captured.cookie)
            }
        });
        return false;
    }

    if (message.action === "downloadMarkdownFile") {
        const filename = sanitizeDownloadFilename(message.filename || "chatgpt-export.md");
        const folder = sanitizeDownloadFolder(message.folder || "chatgpt-bulk-export");
        const dataUrl = `data:${message.mimeType || 'text/markdown'};charset=utf-8,${encodeURIComponent(message.data || '')}`;

        downloadByChrome(dataUrl, filename, sendResponse, folder);
        return true;
    }

    if (message.action === "downloadUrlFile") {
        const filename = sanitizeDownloadFilename(message.filename || "image");
        const folder = sanitizeDownloadFolder(message.folder || "chatgpt-bulk-export");
        downloadByChrome(message.url, filename, sendResponse, folder);
        return true;
    }

    if (message.action === "downloadDataUrlFile") {
        const filename = sanitizeDownloadFilename(message.filename || "image");
        const folder = sanitizeDownloadFolder(message.folder || "chatgpt-bulk-export");
        downloadByChrome(message.dataUrl, filename, sendResponse, folder);
        return true;
    }

    return false;
});

function extractChatGPTRequestHeaders(details) {
    const result = {};
    const requestHeaders = details.requestHeaders || [];

    requestHeaders.forEach(header => {
        const name = header.name.toLowerCase();
        if (name === "authorization") {
            result.authorization = header.value;
        }
        if (name === "cookie") {
            result.cookie = header.value;
        }
    });

    return result;
}

function sanitizeDownloadFilename(filename) {
    return filename
        .replace(/[\\:*?"<>|]/g, "_")
        .replace(/^\/+/, "")
        .replace(/\s+/g, " ")
        .trim() || "chatgpt-export.md";
}

function sanitizeDownloadFolder(folder) {
    return folder
        .replace(/[\\:*?"<>|]/g, "_")
        .replace(/^\/+|\/+$/g, "")
        .replace(/\s+/g, " ")
        .trim() || "chatgpt-bulk-export";
}

function downloadByChrome(url, filename, sendResponse, folder = "chatgpt-bulk-export") {
    const fullFilename = `${folder}/${filename}`;
    pendingDownloadFilenames.push(fullFilename);
    console.log("[ChatGPT Bulk Export] download filename", fullFilename);
    chrome.downloads.download({
        url,
        filename: fullFilename,
        saveAs: false,
        conflictAction: "uniquify"
    }, downloadId => {
        if (chrome.runtime.lastError) {
            const pendingIndex = pendingDownloadFilenames.indexOf(fullFilename);
            if (pendingIndex !== -1) {
                pendingDownloadFilenames.splice(pendingIndex, 1);
            }
            sendResponse({success: false, error: chrome.runtime.lastError.message});
            return;
        }
        sendResponse({success: true, downloadId, filename: fullFilename});
    });
}