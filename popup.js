// Description: This script is executed when the popup is opened.
document.addEventListener('DOMContentLoaded', function() {
    const exportButton = document.getElementById('exportButton');
    const bulkExportButton = document.getElementById('bulkExportButton');
    const unarchiveChatGPTButton = document.getElementById('unarchiveChatGPTButton');
    const copyButton = document.getElementById('copyButton');
    const showExportButton = document.getElementById('showExportButton');
    const statusMessage = document.getElementById('statusMessage');
    let unarchiveState = 'idle';

    function setStatus(message, isError) {
        isError = isError || false;
        if (!statusMessage) return;
        statusMessage.textContent = message || '';
        statusMessage.style.color = isError ? '#b00020' : '#555';
    }

    function setUnarchiveButtonState(state) {
        unarchiveState = state || 'idle';
        if (!unarchiveChatGPTButton) return;

        if (unarchiveState === 'running') {
            unarchiveChatGPTButton.textContent = 'Unarchive Running...';
            unarchiveChatGPTButton.disabled = true;
            unarchiveChatGPTButton.style.opacity = '0.7';
            return;
        }

        if (unarchiveState === 'paused') {
            unarchiveChatGPTButton.textContent = 'Resume Unarchive';
            unarchiveChatGPTButton.disabled = false;
            unarchiveChatGPTButton.style.opacity = '1';
            return;
        }

        unarchiveChatGPTButton.textContent = 'Unarchive All ChatGPT Chats';
        unarchiveChatGPTButton.disabled = false;
        unarchiveChatGPTButton.style.opacity = '1';
    }

    const siteRegistry = globalThis.AI_EXPORT_SITES;

    function sendBulkExportMessage(tabId, site, retryAfterInject) {
        retryAfterInject = retryAfterInject !== false;
        chrome.tabs.sendMessage(tabId, {
            action: site.bulkExportAction,
            source: retryAfterInject ? "popup" : "popup-after-inject"
        }, (response) => {
            if (chrome.runtime.lastError) {
                const message = chrome.runtime.lastError.message;
                console.log("Error starting " + site.name + " bulk export:", message);

                if (retryAfterInject && chrome.scripting && chrome.scripting.executeScript) {
                    setStatus(site.name + " page is not connected. Re-injecting scripts...");
                    chrome.scripting.executeScript({
                        target: { tabId },
                        files: [
                            "sites.js",
                            "providers/provider-registry.js",
                            "providers/chatgpt-provider.js",
                            "providers/gemini-provider.js",
                            "providers/grok-provider.js",
                            "providers/deepseek-provider.js",
                            "content.js"
                        ]
                    }, () => {
                        if (chrome.runtime.lastError) {
                            const injectMessage = chrome.runtime.lastError.message;
                            console.log("Error injecting " + site.name + " content script:", injectMessage);
                            setStatus("Failed to inject " + site.name + " page: " + injectMessage + ". Reload the extension and refresh the page, then try again.", true);
                            return;
                        }

                        setStatus("Scripts re-injected. Restarting " + site.name + " bulk export...");
                        sendBulkExportMessage(tabId, site, false);
                    });
                    return;
                }

                setStatus("Failed to connect to " + site.name + " page: " + message + ". Refresh the page and try again.", true);
                return;
            }
            if (!response || !response.success) {
                const message = response && response.error ? response.error : site.name + " page failed to start bulk export";
                console.log("Failed to start " + site.name + " bulk export:", message);
                setStatus(message, true);
                return;
            }
            setStatus(response.message || site.name + " bulk export started. Check the page progress box.");
        });
    }

    function injectContentScripts(tabId, callback) {
        chrome.scripting.executeScript({
            target: { tabId },
            files: [
                "sites.js",
                "providers/provider-registry.js",
                "providers/chatgpt-provider.js",
                "providers/gemini-provider.js",
                "providers/grok-provider.js",
                "providers/deepseek-provider.js",
                "content.js"
            ]
        }, callback);
    }

    function sendUnarchiveMessage(tabId, retryAfterInject) {
        retryAfterInject = retryAfterInject !== false;
        chrome.tabs.sendMessage(tabId, {
            action: "unarchiveAllChatGPTConversations"
        }, (response) => {
            if (chrome.runtime.lastError) {
                const message = chrome.runtime.lastError.message;
                console.log("Error starting ChatGPT unarchive:", message);

                if (retryAfterInject && chrome.scripting && chrome.scripting.executeScript) {
                    setStatus("ChatGPT page is not connected. Re-injecting scripts...");
                    injectContentScripts(tabId, () => {
                        if (chrome.runtime.lastError) {
                            const injectMessage = chrome.runtime.lastError.message;
                            console.log("Error injecting ChatGPT content script:", injectMessage);
                            setStatus("Failed to inject ChatGPT page: " + injectMessage + ". Reload the extension and refresh the page, then try again.", true);
                            setUnarchiveButtonState('idle');
                            return;
                        }

                        setStatus("Scripts re-injected. Starting ChatGPT unarchive...");
                        sendUnarchiveMessage(tabId, false);
                    });
                    return;
                }

                setStatus("Failed to connect to ChatGPT page: " + message + ". Refresh the page and try again.", true);
                setUnarchiveButtonState('idle');
                return;
            }

            if (!response || !response.success) {
                const message = response && response.error ? response.error : "ChatGPT page failed to start unarchive";
                console.log("Failed to start ChatGPT unarchive:", message);
                setStatus(message, true);
                setUnarchiveButtonState(unarchiveState === 'paused' ? 'paused' : 'idle');
                return;
            }

            setStatus(response.message || "ChatGPT unarchive started. Check the page log panel.");
            setUnarchiveButtonState('running');
        });
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action !== "chatGPTUnarchiveLog") return false;

        if (message.state === "paused") {
            setStatus("ChatGPT unarchive paused. Resume from the page log panel or click this button again.", true);
            setUnarchiveButtonState('paused');
        } else if (message.state === "completed") {
            setStatus("ChatGPT unarchive completed.");
            setUnarchiveButtonState('idle');
        } else if (message.state === "stopped") {
            setStatus("ChatGPT unarchive stopped.");
            setUnarchiveButtonState('idle');
        } else if (message.state === "failed") {
            setStatus("ChatGPT unarchive failed. Check the log.", true);
            setUnarchiveButtonState('idle');
        } else if (message.state === "running") {
            setUnarchiveButtonState('running');
        }

        return false;
    });

    // 查询当前按钮状态
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
            const activeTab = tabs[0].id;
            try {
                chrome.tabs.sendMessage(activeTab, { action: "getButtonStatus" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log("Error querying button status:", chrome.runtime.lastError);
                        // 默认为显示
                        showExportButton.checked = true;
                        return;
                    }
                    
                    if (response && response.show !== undefined) {
                        showExportButton.checked = response.show;
                    } else {
                        // 默认为显示
                        showExportButton.checked = true;
                    }
                });
            } catch (error) {
                console.error("Error sending message:", error);
                showExportButton.checked = true;
            }
        }
    });

    // 监听开关变化
    showExportButton.addEventListener('change', function() {
        const showButton = this.checked;
        
        // 向当前标签页发送消息，更新按钮显示状态
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                const activeTab = tabs[0].id;
                chrome.tabs.sendMessage(activeTab, { 
                    action: "toggleExportButton", 
                    show: showButton 
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log("Error toggling button:", chrome.runtime.lastError);
                    }
                });
            }
        });
    });

    if (exportButton) {
        exportButton.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    const activeTab = tabs[0].id;
                    // 发送消息给 content.js，触发 exportChatAsMarkdown
                    chrome.tabs.sendMessage(activeTab, { action: "exportChatAsMarkdown" }, () => {
                        if (chrome.runtime.lastError) {
                            console.log("Error exporting chat:", chrome.runtime.lastError);
                        }
                    });
                }
            });
        });
    } else {
        console.error('Export button not found');
    }

    if (bulkExportButton) {
        bulkExportButton.addEventListener('click', () => {
            setStatus("Checking current page...");
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs || tabs.length === 0 || typeof tabs[0].id !== 'number') {
                    setStatus("Current tab not found", true);
                    return;
                }

                const activeTab = tabs[0].id;
                const activeUrl = tabs[0].url || '';

                const site = siteRegistry && siteRegistry.getSiteByUrl ? siteRegistry.getSiteByUrl(activeUrl) : null;
                const supportedBulkSites = siteRegistry && siteRegistry.sites
                    ? siteRegistry.sites
                    .filter(item => item.supportsBulkExport)
                    .map(item => item.name)
                    .join(", ")
                    : "ChatGPT, Gemini";

                if (!site) {
                    const supportedSites = siteRegistry && siteRegistry.sites
                        ? siteRegistry.sites.map(item => item.name).join(", ")
                        : supportedBulkSites;
                    setStatus("Export is not supported on this page. Supported sites: " + supportedSites, true);
                    return;
                }

                if (!site.supportsBulkExport) {
                    setStatus("Bulk Export does not support " + site.name + ". Supported sites: " + supportedBulkSites, true);
                    return;
                }

                if (!site.bulkExportRequiresRefresh) {
                    setStatus("Starting " + site.name + " bulk export...");
                    sendBulkExportMessage(activeTab, site);
                    return;
                }

                setStatus("Preparing " + site.name + " bulk export...");
                chrome.runtime.sendMessage({ action: "prepareAndStartBulkExport", tabId: activeTab }, (response) => {
                    if (chrome.runtime.lastError) {
                        const message = chrome.runtime.lastError.message;
                        console.log("Error preparing bulk export:", message);
                        setStatus("Failed to prepare bulk export: " + message, true);
                        return;
                    }
                    if (!response || !response.success) {
                        const message = response && response.error ? response.error : site.name + " bulk export preparation failed";
                        console.log("Failed to prepare bulk export:", message);
                        setStatus(message, true);
                        return;
                    }
                    setStatus(site.name + " page is refreshing. Export will start after reload.");
                });
            });
        });
    } else {
        console.error('Bulk export button not found');
    }

    if (unarchiveChatGPTButton) {
        unarchiveChatGPTButton.addEventListener('click', () => {
            setStatus(unarchiveState === 'paused' ? "Resuming ChatGPT unarchive..." : "Checking current page...");

            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs || tabs.length === 0 || typeof tabs[0].id !== 'number') {
                    setStatus("Current tab not found", true);
                    return;
                }

                const activeTab = tabs[0].id;
                const activeUrl = tabs[0].url || '';
                const site = siteRegistry && siteRegistry.getSiteByUrl ? siteRegistry.getSiteByUrl(activeUrl) : null;

                if (!site || site.id !== "chatgpt") {
                    setStatus("Unarchive can only run on a ChatGPT page.", true);
                    return;
                }

                setUnarchiveButtonState('running');
                sendUnarchiveMessage(activeTab);
            });
        });
    } else {
        console.error('Unarchive ChatGPT button not found');
    }

    if (copyButton) {
        copyButton.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    const activeTab = tabs[0].id;
                    // 发送消息给 content.js，触发 copyChatAsMarkdown
                    chrome.tabs.sendMessage(activeTab, { action: "copyChatAsMarkdown" }, () => {
                        if (chrome.runtime.lastError) {
                            console.log("Error copying chat:", chrome.runtime.lastError);
                        }
                    });
                }
            });
        });
    } else {
        console.error('Copy button not found');
    }
});
