// Description: This script is executed when the popup is opened.
document.addEventListener('DOMContentLoaded', function() {
    const exportButton = document.getElementById('exportButton');
    const copyButton = document.getElementById('copyButton');
    const showExportButton = document.getElementById('showExportButton');

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
                    chrome.tabs.sendMessage(activeTab, { action: "exportChatAsMarkdown" });
                }
            });
        });
    } else {
        console.error('Export button not found');
    }

    if (copyButton) {
        copyButton.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    const activeTab = tabs[0].id;
                    // 发送消息给 content.js，触发 copyChatAsMarkdown
                    chrome.tabs.sendMessage(activeTab, { action: "copyChatAsMarkdown" });
                }
            });
        });
    } else {
        console.error('Copy button not found');
    }
});
