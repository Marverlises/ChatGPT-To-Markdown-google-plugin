(function(global) {
    const sites = [
        {
            id: "chatgpt",
            name: "ChatGPT",
            provider: "chatgpt",
            hosts: ["chatgpt.com", "*.chatgpt.com", "*.openai.com"],
            contentScriptMatches: [
                "https://chatgpt.com/*",
                "https://*.chatgpt.com/*",
                "https://*.openai.com/*"
            ],
            hostPermissions: [
                "https://chatgpt.com/*",
                "https://*.chatgpt.com/*",
                "https://*.openai.com/*"
            ],
            supportsBulkExport: true,
            bulkExportAction: "bulkExportChatGPTConversations",
            bulkExportRequiresRefresh: true,
            bulkExportFolder: "chatgpt-bulk-export"
        },
        {
            id: "gemini",
            name: "Gemini",
            provider: "gemini",
            hosts: ["gemini.google.com"],
            contentScriptMatches: ["https://gemini.google.com/*"],
            hostPermissions: ["https://gemini.google.com/*"],
            supportsBulkExport: true,
            bulkExportAction: "bulkExportGeminiConversations",
            bulkExportRequiresRefresh: false,
            bulkExportFolder: "gemini-bulk-export"
        },
        {
            id: "grok",
            name: "Grok",
            provider: "grok",
            hosts: ["grok.com", "*.grok.com"],
            contentScriptMatches: [
                "https://grok.com/*",
                "https://*.grok.com/*"
            ],
            hostPermissions: [
                "https://grok.com/*",
                "https://*.grok.com/*"
            ],
            supportsBulkExport: false,
            bulkExportFolder: "grok-bulk-export"
        },
        {
            id: "deepseek",
            name: "DeepSeek",
            provider: "deepseek",
            hosts: ["chat.deepseek.com", "*.deepseek.com"],
            contentScriptMatches: [
                "https://chat.deepseek.com/*",
                "https://*.deepseek.com/*"
            ],
            hostPermissions: [
                "https://chat.deepseek.com/*",
                "https://*.deepseek.com/*"
            ],
            supportsBulkExport: false,
            bulkExportFolder: "deepseek-bulk-export"
        }
    ];

    function getHostname(urlOrHostname) {
        if (!urlOrHostname) return "";
        try {
            return new URL(urlOrHostname).hostname.toLowerCase();
        } catch (error) {
            return String(urlOrHostname).toLowerCase();
        }
    }

    function hostMatches(pattern, hostname) {
        if (!pattern || !hostname) return false;
        const normalizedPattern = pattern.toLowerCase();
        const normalizedHostname = hostname.toLowerCase();

        if (normalizedPattern.startsWith("*.")) {
            const root = normalizedPattern.slice(2);
            return normalizedHostname === root || normalizedHostname.endsWith(`.${root}`);
        }

        return normalizedHostname === normalizedPattern;
    }

    function getSiteByUrl(urlOrHostname) {
        const hostname = getHostname(urlOrHostname);
        return sites.find(site => site.hosts.some(pattern => hostMatches(pattern, hostname))) || null;
    }

    function getSiteById(id) {
        return sites.find(site => site.id === id) || null;
    }

    global.AI_EXPORT_SITES = {
        sites,
        getHostname,
        getSiteByUrl,
        getSiteById,
        hostMatches
    };
})(globalThis);
