(function(global) {
    function escapeCodeBlock(content) {
        return String(content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function processCodeBlocks(doc) {
        doc.querySelectorAll('div.not-prose').forEach(div => {
            const codeType = div.querySelector('div > div > span')?.textContent || '';
            const markdownCode = escapeCodeBlock(div.querySelector('div > div:nth-child(3) > pre code')?.textContent || div.textContent);
            div.innerHTML = `\n\`\`\`${codeType}\n${markdownCode}\n\`\`\``;
        });
    }

    global.AI_EXPORT_PROVIDERS.registerProvider({
        id: "grok",
        name: "Grok",
        page: {
            getElements: () => document.querySelectorAll('div.message-bubble'),
            processCodeBlocks
        },
        download: {
            folder: "grok-bulk-export"
        }
    });
})(globalThis);
