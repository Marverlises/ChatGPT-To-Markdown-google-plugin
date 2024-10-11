// Description: This script is executed when the popup is opened.
document.addEventListener('DOMContentLoaded', function() {
    const exportButton = document.getElementById('exportButton');

    if (exportButton) {
        exportButton.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const activeTab = tabs[0].id;

                // 发送消息给 content.js，触发 exportChatAsMarkdown
                chrome.tabs.sendMessage(activeTab, { action: "exportChatAsMarkdown" });
            });
        });
    } else {
        console.error('Export button not found');
    }
});
