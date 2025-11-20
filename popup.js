// Description: This script is executed when the popup is opened.
document.addEventListener('DOMContentLoaded', function() {
    const exportButton = document.getElementById('exportButton');
    const copyButton = document.getElementById('copyButton');
    const showExportButton = document.getElementById('showExportButton');

    // Multi-export elements
    const loadConversationsBtn = document.getElementById('loadConversations');
    const conversationList = document.getElementById('conversationList');
    const conversationItems = document.getElementById('conversationItems');
    const selectAllBtn = document.getElementById('selectAll');
    const deselectAllBtn = document.getElementById('deselectAll');
    const exportSelectedBtn = document.getElementById('exportSelected');
    const cancelExportBtn = document.getElementById('cancelExport');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const statusText = document.getElementById('statusText');

    // Settings elements
    const pageLoadWaitSlider = document.getElementById('pageLoadWait');
    const conversationDelaySlider = document.getElementById('conversationDelay');
    const pageLoadDisplay = document.getElementById('pageLoadDisplay');
    const delayDisplay = document.getElementById('delayDisplay');
    const saveSettingsBtn = document.getElementById('saveSettings');
    const saveStatus = document.getElementById('saveStatus');

    let conversationData = [];
    let exportInterval = null;

    // Load saved settings
    chrome.storage.sync.get(['pageLoadWait', 'conversationDelay'], (result) => {
        if (result.pageLoadWait !== undefined) {
            pageLoadWaitSlider.value = result.pageLoadWait;
            pageLoadDisplay.textContent = result.pageLoadWait;
        }
        if (result.conversationDelay !== undefined) {
            conversationDelaySlider.value = result.conversationDelay;
            delayDisplay.textContent = result.conversationDelay;
        }
    });

    // Update display when sliders change
    pageLoadWaitSlider.addEventListener('input', (e) => {
        pageLoadDisplay.textContent = e.target.value;
    });

    conversationDelaySlider.addEventListener('input', (e) => {
        delayDisplay.textContent = e.target.value;
    });

    // Save settings
    saveSettingsBtn.addEventListener('click', () => {
        const settings = {
            pageLoadWait: parseFloat(pageLoadWaitSlider.value),
            conversationDelay: parseFloat(conversationDelaySlider.value)
        };

        chrome.storage.sync.set(settings, () => {
            saveStatus.textContent = '✓ Saved!';
            setTimeout(() => {
                saveStatus.textContent = '';
            }, 2000);
        });
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

    // Multi-export functionality

    // Load conversations handler
    loadConversationsBtn.addEventListener('click', async () => {
        loadConversationsBtn.disabled = true;
        loadConversationsBtn.textContent = 'Loading...';

        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const response = await chrome.tabs.sendMessage(tabs[0].id, {
                action: "getConversationList"
            });

            if (response.success && response.conversations.length > 0) {
                conversationData = response.conversations;
                displayConversations(conversationData);
                conversationList.style.display = 'block';
                exportSelectedBtn.style.display = 'block';
                loadConversationsBtn.textContent = `Loaded ${conversationData.length} conversations`;
            } else {
                alert('No conversations found. Make sure you are on ChatGPT website.');
                loadConversationsBtn.textContent = 'Load Conversation List';
                loadConversationsBtn.disabled = false;
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
            alert('Failed to load conversations. See console for details.');
            loadConversationsBtn.textContent = 'Load Conversation List';
            loadConversationsBtn.disabled = false;
        }
    });

    // Display conversations as checkboxes
    function displayConversations(conversations) {
        conversationItems.innerHTML = '';

        conversations.forEach((conv, index) => {
            const item = document.createElement('div');
            item.className = 'conversation-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `conv_${index}`;
            checkbox.value = index;
            checkbox.checked = true;

            const label = document.createElement('label');
            label.htmlFor = `conv_${index}`;
            label.className = 'conversation-title';
            label.textContent = conv.title;
            label.title = conv.title; // Tooltip for full title

            item.appendChild(checkbox);
            item.appendChild(label);
            conversationItems.appendChild(item);
        });
    }

    // Select all handler
    selectAllBtn.addEventListener('click', () => {
        const checkboxes = conversationItems.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = true);
    });

    // Deselect all handler
    deselectAllBtn.addEventListener('click', () => {
        const checkboxes = conversationItems.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
    });

    // Export selected handler
    exportSelectedBtn.addEventListener('click', async () => {
        const checkboxes = conversationItems.querySelectorAll('input[type="checkbox"]:checked');
        const selectedConversations = Array.from(checkboxes).map(cb => {
            const index = parseInt(cb.value);
            return conversationData[index];
        });

        if (selectedConversations.length === 0) {
            alert('Please select at least one conversation to export.');
            return;
        }

        if (!confirm(`Export ${selectedConversations.length} conversations? This may take a while.`)) {
            return;
        }

        // Start export
        exportSelectedBtn.disabled = true;
        loadConversationsBtn.disabled = true;
        cancelExportBtn.style.display = 'block';
        progressBar.style.display = 'block';
        statusText.style.display = 'block';

        try {
            const response = await chrome.runtime.sendMessage({
                action: "startMultiExport",
                conversations: selectedConversations
            });

            if (response.success) {
                startProgressMonitoring();
            } else {
                alert(`Error: ${response.error}`);
                resetExportUI();
            }
        } catch (error) {
            console.error('Error starting export:', error);
            alert('Failed to start export. See console for details.');
            resetExportUI();
        }
    });

    // Cancel export handler
    cancelExportBtn.addEventListener('click', async () => {
        if (confirm('Cancel the current export?')) {
            await chrome.runtime.sendMessage({ action: "cancelExport" });
            stopProgressMonitoring();
            resetExportUI();
            statusText.textContent = 'Export cancelled';
        }
    });

    // Monitor export progress
    function startProgressMonitoring() {
        exportInterval = setInterval(async () => {
            try {
                const progress = await chrome.runtime.sendMessage({
                    action: "getExportProgress"
                });

                updateProgress(progress);

                if (!progress.isExporting) {
                    stopProgressMonitoring();
                    setTimeout(() => resetExportUI(), 3000);
                }
            } catch (error) {
                console.error('Error getting progress:', error);
            }
        }, 1000);
    }

    function stopProgressMonitoring() {
        if (exportInterval) {
            clearInterval(exportInterval);
            exportInterval = null;
        }
    }

    function updateProgress(progress) {
        const percentage = progress.total > 0 ?
            (progress.current / progress.total * 100) : 0;

        progressFill.style.width = `${percentage}%`;
        statusText.textContent = `Processing ${progress.current}/${progress.total}` +
            (progress.errors > 0 ? ` (${progress.errors} errors)` : '');
    }

    function resetExportUI() {
        exportSelectedBtn.disabled = false;
        loadConversationsBtn.disabled = false;
        cancelExportBtn.style.display = 'none';
        progressBar.style.display = 'none';
        statusText.style.display = 'none';
        progressFill.style.width = '0%';
    }
});
