/**
 * @Author Ye bv
 * @Time 2024/2/8 15:02
 * @Description
 */
// 当插件安装或更新时触发
chrome.runtime.onInstalled.addListener(function() {
    console.log("ChatGPT Exporter 插件已安装或更新");
});

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === "exportChatHistory") {
        // 在这里添加导出聊天记录的逻辑
        console.log("接收到导出聊天记录的请求");

        // 这里可以向内容脚本发送消息，执行相应的操作
        // 例如：sendResponse({ success: true });
    }
});