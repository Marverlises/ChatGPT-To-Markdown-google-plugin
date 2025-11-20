/**
 * @Author Ye bv
 * @Time 2024/2/8 15:02
 * @Description Multi-conversation export orchestrator
 */

// State management for multi-conversation export
let exportState = {
    isExporting: false,
    conversations: [],
    currentIndex: 0,
    successCount: 0,
    errorCount: 0
};

/**
 * Start multi-conversation export process
 * @param {Array} conversations - Array of conversation objects {id, url, title}
 */
async function startMultiConversationExport(conversations) {
    if (exportState.isExporting) {
        console.log("Export already in progress");
        return { error: "Export already in progress" };
    }

    exportState = {
        isExporting: true,
        conversations: conversations,
        currentIndex: 0,
        successCount: 0,
        errorCount: 0
    };

    // Store state in chrome.storage for recovery
    await chrome.storage.local.set({ exportState });

    console.log(`Starting multi-conversation export: ${conversations.length} conversations`);

    // Reset content script's in-memory data before starting
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tabs[0].id, {
            action: "resetMultiExportData"
        });
        console.log("Reset content script export data");
    } catch (error) {
        console.warn("Could not reset content script data:", error);
    }

    // Start processing
    processNextConversation();

    return { success: true, total: conversations.length };
}

/**
 * Process next conversation in queue
 */
async function processNextConversation() {
    const { conversations, currentIndex } = exportState;

    if (currentIndex >= conversations.length) {
        // All conversations processed
        console.log("All conversations processed. Creating combined ZIP...");
        await finishMultiExport();
        return;
    }

    const conversation = conversations[currentIndex];
    console.log(`Processing ${currentIndex + 1}/${conversations.length}: ${conversation.title}`);

    try {
        // Get the active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0].id;

        // Navigate to conversation
        await chrome.tabs.update(tabId, { url: conversation.url });

        // Wait for page load with user-configured delay
        await waitForTabLoad(tabId);

        // Send message to content script to export
        // Note: Data is stored in IndexedDB, not returned here
        const response = await chrome.tabs.sendMessage(tabId, {
            action: "exportCurrentConversation",
            conversationInfo: conversation
        });

        if (response && response.success) {
            exportState.successCount++;
            console.log(`Successfully exported: ${conversation.title}`);
        } else {
            exportState.errorCount++;
            const errorMsg = response ? response.error : "No response from content script";
            console.error(`Failed to export ${conversation.title}: ${errorMsg}`);
        }

    } catch (error) {
        console.error(`Error processing conversation ${conversation.title}:`, error);
        exportState.errorCount++;
    }

    // Move to next conversation
    exportState.currentIndex++;
    await chrome.storage.local.set({ exportState });

    // Get user-configured delay between conversations
    const settings = await chrome.storage.sync.get(['conversationDelay']);
    const delay = (settings.conversationDelay !== undefined ? settings.conversationDelay : 0.5) * 1000;

    console.log(`Waiting ${delay}ms before next conversation...`);
    setTimeout(() => processNextConversation(), delay);
}

/**
 * Wait for tab to fully load
 * @param {number} tabId - Tab ID to monitor
 * @returns {Promise} Resolves when tab is fully loaded
 */
async function waitForTabLoad(tabId) {
    // Get user-configured page load wait time
    const settings = await chrome.storage.sync.get(['pageLoadWait']);
    const waitTime = (settings.pageLoadWait !== undefined ? settings.pageLoadWait : 2) * 1000;

    return new Promise((resolve) => {
        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                console.log(`Page loaded, waiting ${waitTime / 1000} seconds for dynamic content...`);
                setTimeout(() => {
                    console.log("Dynamic content wait complete");
                    resolve();
                }, waitTime);
            }
        };

        chrome.tabs.onUpdated.addListener(listener);

        // Timeout after 60 seconds
        setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            console.warn("Page load timeout (60s)");
            resolve();
        }, 60000);
    });
}

/**
 * Finish multi-export and create combined ZIP
 */
async function finishMultiExport() {
    console.log(`Export complete. Successfully exported: ${exportState.successCount}, Errors: ${exportState.errorCount}`);

    // Get the active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0].id;

    // Note: Data is stored in content script's memory, not passed through messages
    // This avoids Blob serialization issues
    await chrome.tabs.sendMessage(tabId, {
        action: "createMultiConversationZip"
    });

    // Reset state
    exportState.isExporting = false;
    await chrome.storage.local.remove('exportState');
}

/**
 * Get export progress
 * @returns {Object} Progress information
 */
async function getExportProgress() {
    return {
        isExporting: exportState.isExporting,
        total: exportState.conversations.length,
        current: exportState.currentIndex,
        errors: exportState.errorCount || 0
    };
}

/**
 * Cancel ongoing export
 */
async function cancelExport() {
    console.log("Export cancelled by user");
    exportState.isExporting = false;
    await chrome.storage.local.remove('exportState');
    return { success: true };
}

// Message listeners
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "startMultiExport") {
        startMultiConversationExport(message.conversations)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ error: error.message }));
        return true; // Async response
    }

    if (message.action === "getExportProgress") {
        getExportProgress()
            .then(progress => sendResponse(progress))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }

    if (message.action === "cancelExport") {
        cancelExport()
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }

    // Legacy message handler for single export
    if (message.action === "exportChatHistory") {
        console.log("接收到导出聊天记录的请求");
    }
});

// Installation listener
chrome.runtime.onInstalled.addListener(() => {
    console.log("ChatGPT Exporter (Multi-Conversation v6.0) 插件已安装或更新");

    // Check for interrupted export and clear it
    chrome.storage.local.get('exportState', (result) => {
        if (result.exportState && result.exportState.isExporting) {
            console.log("Found interrupted export. Clearing...");
            chrome.storage.local.remove('exportState');
        }
    });
});
