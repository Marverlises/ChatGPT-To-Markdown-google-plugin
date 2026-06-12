(function(global) {
    function getDeepSeekPageConversationElements() {
        const userCandidates = document.querySelectorAll('[class*="user"], [data-role="user"], [data-message-role="user"]');
        const assistantCandidates = document.querySelectorAll('.ds-markdown, [class*="assistant"], [data-role="assistant"], [data-message-role="assistant"]');
        const result = [];
        const length = Math.max(userCandidates.length, assistantCandidates.length);

        for (let i = 0; i < length; i++) {
            if (userCandidates[i]) result.push(userCandidates[i]);
            if (assistantCandidates[i]) result.push(assistantCandidates[i]);
        }

        return result;
    }

    function escapeCodeBlock(content) {
        return String(content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function processCodeBlocks(doc) {
        doc.querySelectorAll('pre').forEach(pre => {
            const language = pre.querySelector('[class*="language-"]')?.className?.match(/language-([a-z0-9_-]+)/i)?.[1] || '';
            const markdownCode = escapeCodeBlock(pre.querySelector('code')?.textContent || pre.textContent);
            pre.innerHTML = `\n\`\`\`${language}\n${markdownCode}\n\`\`\``;
        });
    }

    global.AI_EXPORT_PROVIDERS.registerProvider({
        id: "deepseek",
        name: "DeepSeek",
        page: {
            getElements: getDeepSeekPageConversationElements,
            processCodeBlocks
        },
        download: {
            folder: "deepseek-bulk-export"
        }
    });
})(globalThis);
