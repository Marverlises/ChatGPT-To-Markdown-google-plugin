/**
 * @Author Ye bv
 * @Time 2024/2/8 15:02
 * @Description
 */

// 监听来自 popup.js 的消息，实现按下按钮后导出或复制聊天记录
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "exportChatAsMarkdown") {
        exportChatAsMarkdown();
    }
    if (request.action === "copyChatAsMarkdown") {
        copyChatAsMarkdown();
    }
});

window.onload = () => {
    createExportButton();
    // 定时检查并重新插入按钮
    setInterval(() => {
        if (!document.getElementById('export-chat')) {
            createExportButton();
        }
    }, 1000); // 每秒检查一次
};

// 获取对话内容的元素
function getConversationElements() {
    const currentUrl = window.location.href;
    if (currentUrl.includes("openai.com") || currentUrl.includes("chatgpt.com")) {
        // ChatGPT 的对话选择器
        return document.querySelectorAll('div.flex.flex-grow.flex-col.max-w-full');
    } else if (currentUrl.includes("grok.com")) {
        // Grok 的对话选择器：选择所有消息泡泡
        return document.querySelectorAll('div.message-bubble');
    }
    return [];
}

// 复制聊天记录为 Markdown 格式
function copyChatAsMarkdown() {
    let markdownContent = "";
    let allElements = getConversationElements();

    for (let i = 0; i < allElements.length; i += 2) {
        if (!allElements[i + 1]) break; // 防止越界
        let userText = allElements[i].textContent.trim();
        let answerHtml = allElements[i + 1].innerHTML.trim();

        userText = htmlToMarkdown(userText);
        answerHtml = htmlToMarkdown(answerHtml);

        const isGrok = window.location.href.includes("grok.com");
        markdownContent += `\n# 用户问题\n${userText}\n# ${isGrok ? 'Grok' : 'ChatGPT'}\n${answerHtml}`;
    }

    markdownContent = markdownContent.replace(/&amp;/g, '&');
    if (!markdownContent) {
        console.log("未找到对话内容");
        return;
    }

    // 检查是否已经存在模态框
    if (document.getElementById('markdown-modal')) return;

    // 创建模态背景
    const modal = document.createElement('div');
    modal.id = 'markdown-modal';
    Object.assign(modal.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '1000'
    });

    // 创建模态内容容器
    const modalContent = document.createElement('div');
    Object.assign(modalContent.style, {
        backgroundColor: '#fff',
        color: '#000',
        padding: '20px',
        borderRadius: '8px',
        width: '50%',
        height: '80%',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        overflow: 'hidden'
    });

    // 创建文本区域
    const textarea = document.createElement('textarea');
    textarea.value = markdownContent;
    Object.assign(textarea.style, {
        flex: '1',
        resize: 'none',
        width: '100%',
        padding: '10px',
        fontSize: '14px',
        fontFamily: 'monospace',
        marginBottom: '10px',
        boxSizing: 'border-box',
        color: '#000',
        backgroundColor: '#f9f9f9',
        border: '1px solid #ccc',
        borderRadius: '4px'
    });
    textarea.setAttribute('readonly', true);

    // 创建按钮容器
    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, {
        display: 'flex',
        justifyContent: 'flex-end'
    });

    // 创建复制按钮
    const copyButton = document.createElement('button');
    copyButton.textContent = '复制';
    Object.assign(copyButton.style, {
        padding: '8px 16px',
        fontSize: '14px',
        cursor: 'pointer',
        backgroundColor: '#28A745',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        marginRight: '10px'
    });

    // 创建关闭按钮
    const closeButton = document.createElement('button');
    closeButton.textContent = '关闭';
    Object.assign(closeButton.style, {
        padding: '8px 16px',
        fontSize: '14px',
        cursor: 'pointer',
        backgroundColor: '#007BFF',
        color: '#fff',
        border: 'none',
        borderRadius: '4px'
    });

    buttonContainer.appendChild(copyButton);
    buttonContainer.appendChild(closeButton);
    modalContent.appendChild(textarea);
    modalContent.appendChild(buttonContainer);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    textarea.focus();

    copyButton.addEventListener('click', () => {
        textarea.select();
        navigator.clipboard.writeText(textarea.value)
            .then(() => {
                copyButton.textContent = '已复制';
                setTimeout(() => {
                    copyButton.textContent = '复制';
                }, 2000);
            })
            .catch(err => console.error('复制失败', err));
    });

    closeButton.addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    const escListener = (e) => {
        if (e.key === 'Escape' && document.getElementById('markdown-modal')) {
            document.body.removeChild(modal);
            document.removeEventListener('keydown', escListener);
        }
    };
    document.addEventListener('keydown', escListener);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
            document.removeEventListener('keydown', escListener);
        }
    });
}

// 创建导出按钮
function createExportButton() {
    const exportButton = document.createElement('button');
    exportButton.textContent = 'Export Chat';
    exportButton.id = 'export-chat';
    const styles = {
        position: 'fixed',
        height: '36px',
        top: '10px',
        right: '35%',
        zIndex: '10000',
        padding: '10px',
        backgroundColor: '#4cafa3',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        textAlign: 'center',
        lineHeight: '16px'
    };
    document.body.appendChild(exportButton);
    Object.assign(exportButton.style, styles);
    exportButton.addEventListener('click', exportChatAsMarkdown);
}

// 导出聊天记录为 Markdown 格式
function exportChatAsMarkdown() {
    let markdownContent = "";
    let allElements = getConversationElements();

    for (let i = 0; i < allElements.length; i += 2) {
        if (!allElements[i + 1]) break; // 防止越界
        let userText = allElements[i].textContent.trim();
        let answerHtml = allElements[i + 1].innerHTML.trim();

        userText = htmlToMarkdown(userText);
        answerHtml = htmlToMarkdown(answerHtml);

        const isGrok = window.location.href.includes("grok.com");
        markdownContent += `\n# 用户问题\n${userText}\n# ${isGrok ? 'Grok' : 'ChatGPT'}\n${answerHtml}`;
    }
    markdownContent = markdownContent.replace(/&amp;/g, '&');

    if (markdownContent) {
        download(markdownContent, 'chat-export.md', 'text/markdown');
    } else {
        console.log("未找到对话内容");
    }
}

// 下载函数
function download(data, filename, type) {
    var file = new Blob([data], { type: type });
    if (window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveOrOpenBlob(file, filename);
    } else {
        var a = document.createElement('a'),
            url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    }
}

// 将 HTML 转换为 Markdown
function htmlToMarkdown(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. 处理公式
    doc.querySelectorAll('span.katex-html').forEach(element => element.remove());
    doc.querySelectorAll('mrow').forEach(mrow => mrow.remove());
    doc.querySelectorAll('annotation[encoding="application/x-tex"]').forEach(element => {
        if (element.closest('.katex-display')) {
            const latex = element.textContent;
            element.replaceWith(`\n$$\n${latex}\n$$\n`);
        } else {
            const latex = element.textContent;
            element.replaceWith(`$${latex}$`);
        }
    });

    // 2. 加粗处理
    doc.querySelectorAll('strong, b').forEach(bold => {
        const markdownBold = `**${bold.textContent}**`;
        bold.parentNode.replaceChild(document.createTextNode(markdownBold), bold);
    });

    // 3. 斜体处理
    doc.querySelectorAll('em, i').forEach(italic => {
        const markdownItalic = `*${italic.textContent}*`;
        italic.parentNode.replaceChild(document.createTextNode(markdownItalic), italic);
    });

    // 4. 行内代码处理
    doc.querySelectorAll('p code').forEach(code => {
        const markdownCode = `\`${code.textContent}\``;
        code.parentNode.replaceChild(document.createTextNode(markdownCode), code);
    });

    // 5. 链接处理
    doc.querySelectorAll('a').forEach(link => {
        const markdownLink = `[${link.textContent}](${link.href})`;
        link.parentNode.replaceChild(document.createTextNode(markdownLink), link);
    });

    // 6. 处理图片
    doc.querySelectorAll('img').forEach(img => {
        const markdownImage = `![${img.alt}](${img.src})`;
        img.parentNode.replaceChild(document.createTextNode(markdownImage), img);
    });

    // 7. 代码块处理
    doc.querySelectorAll('pre').forEach(pre => {
        const codeType = pre.querySelector('div > div:first-child')?.textContent || '';
        const markdownCode = pre.querySelector('div > div:nth-child(3) > code')?.textContent || pre.textContent;
        pre.innerHTML = `\n\`\`\`${codeType}\n${markdownCode}\`\`\`\n`;
    });

    // 8. 处理列表
    doc.querySelectorAll('ul').forEach(ul => {
        let markdown = '';
        ul.querySelectorAll(':scope > li').forEach(li => {
            markdown += `- ${li.textContent.trim()}\n`;
        });
        ul.parentNode.replaceChild(document.createTextNode('\n' + markdown.trim()), ul);
    });

    doc.querySelectorAll('ol').forEach(ol => {
        let markdown = '';
        ol.querySelectorAll(':scope > li').forEach((li, index) => {
            markdown += `${index + 1}. ${li.textContent.trim()}\n`;
        });
        ol.parentNode.replaceChild(document.createTextNode('\n' + markdown.trim()), ol);
    });

    // 9. 标题处理
    for (let i = 1; i <= 6; i++) {
        doc.querySelectorAll(`h${i}`).forEach(header => {
            const markdownHeader = '\n' + `${'#'.repeat(i)} ${header.textContent}\n`;
            header.parentNode.replaceChild(document.createTextNode(markdownHeader), header);
        });
    }

    // 10. 段落处理
    doc.querySelectorAll('p').forEach(p => {
        const markdownParagraph = '\n' + p.textContent + '\n';
        p.parentNode.replaceChild(document.createTextNode(markdownParagraph), p);
    });

    // 11. 表格处理
    doc.querySelectorAll('table').forEach(table => {
        let markdown = '';
        table.querySelectorAll('thead tr').forEach(tr => {
            tr.querySelectorAll('th').forEach(th => {
                markdown += `| ${th.textContent} `;
            });
            markdown += '|\n';
            tr.querySelectorAll('th').forEach(() => {
                markdown += '| ---- ';
            });
            markdown += '|\n';
        });
        table.querySelectorAll('tbody tr').forEach(tr => {
            tr.querySelectorAll('td').forEach(td => {
                markdown += `| ${td.textContent} `;
            });
            markdown += '|\n';
        });
        table.parentNode.replaceChild(document.createTextNode('\n' + markdown.trim() + '\n'), table);
    });

    let markdown = doc.body.innerHTML.replace(/<[^>]*>/g, '');
    markdown = markdown.replaceAll(/- &gt;/g, '- $\\gt$');
    markdown = markdown.replaceAll(/>/g, '>');
    markdown = markdown.replaceAll(/</g, '<');
    markdown = markdown.replaceAll(/≥/g, '>=');
    markdown = markdown.replaceAll(/≤/g, '<=');
    markdown = markdown.replaceAll(/≠/g, '\\neq');

    return markdown.trim();
}