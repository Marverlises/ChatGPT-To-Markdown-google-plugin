# 🚀 AI对话导出工具 (AI Chat Exporter)

<div align="center">
  <h3>轻松将AI对话导出为标准Markdown格式</h3>
  <p>支持 ChatGPT, Grok 和 Gemini 平台</p>
  
  ![License](https://img.shields.io/badge/License-MIT-blue.svg)
  ![Version](https://img.shields.io/badge/Version-6.2-green.svg)
  ![Platform](https://img.shields.io/badge/Platform-Chrome-orange.svg)
</div>

## ✨ 功能特点

- 🔄 **多平台支持**：同时支持 **ChatGPT**, **Grok** 和 **Gemini** 三大AI平台
- 📝 **完整内容保留**：精确导出所有对话内容，包括**代码块**、**数学公式**、**链接**和**格式化文本**
- 🎨 **标准Markdown格式**：输出符合标准的Markdown格式，确保最佳兼容性
- 💾 **双重导出选项**：支持直接下载.md文件或复制到剪贴板
- 📦 **图片自动下载** (v5.5新增)：导出时自动下载对话中的所有图片，打包为ZIP文件
  - 图片自动保存在`images/`文件夹中
  - 使用序号命名（image_001.png, image_002.jpg等）
  - Markdown中使用相对路径引用，完美兼容Typora
- 🔄 **批量多对话导出** (v6.0新增)：一键批量导出多个对话
  - 自动加载对话列表，支持选择性导出
  - 智能导航和数据收集
  - 所有对话打包到一个ZIP文件中
  - 使用IndexedDB存储，支持大规模导出
- ⚡ **可配置速度设置** (v6.2新增)：灵活调整导出速度
  - 可调节页面加载等待时间（1-10秒）
  - 可调节对话间延迟（0-5秒）
  - 实时保存设置，立即生效
  - 根据网络状况自由优化速度
- 🖼️ **Typora完美兼容**：特别优化以确保在Typora等Markdown编辑器中正确显示
- 🔘 **界面控制**：可以通过弹窗开关控制页面上导出按钮的显示
- 🛠️ **对应Google插件**：提供[Chrome插件](https://chromewebstore.google.com/detail/chatgpt-to-markdown-plus/gcocgmkjaagjcijfmocbjghbpinamnhp?hl=zh-CN&utm_source=ext_sidebar)版本，方便在Google平台上使用，插件市场搜索 **ChatGPT to MarkDown plus**

## 🛠️ 安装步骤

### 步骤 1: 下载代码库

克隆或下载本仓库到本地电脑。

### 步骤 2: 加载插件

![image-20240208173306163-1707387378543-1](https://github.com/thisisbaiy/ChatGPT-To-Markdown-google-plugin/assets/96861449/5a371f83-1a2a-422e-99c0-7317074f434f)

1. 打开Chrome浏览器，进入扩展程序页面（chrome://extensions/）
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择下载的仓库文件夹，点击确认

### 步骤 3: 使用插件

![image-20240208173337825](https://github.com/thisisbaiy/ChatGPT-To-Markdown-google-plugin/assets/96861449/3e75a5bb-4a3d-459c-bfff-7a695a88a431)

当您打开支持的AI平台网站时（ChatGPT, Grok或Gemini），您将在页面上看到绿色的"Export Chat"按钮。

使用方法:
1. 浏览您想要导出的对话
2. 点击绿色的"Export Chat"按钮自动下载ZIP压缩包（包含Markdown文件和所有图片）
3. 解压ZIP文件，使用Typora等编辑器打开.md文件即可查看完整对话（包含图片）
4. 或者点击插件图标，选择"Copy to Clipboard"将内容复制到剪贴板（纯文本，不含图片）

**注意**：导出包含图片时会下载为.zip文件，解压后可在Typora中正常显示图片。

## 📦 图片导出功能详解 (v5.5新功能)

导出带图片的对话时，插件会：

1. **自动检测图片**：扫描对话中的所有图片（用户上传的和AI生成的）
2. **下载图片文件**：将图片从URL下载到本地
3. **智能命名**：按序号命名（image_001.png, image_002.jpg等），自动识别图片格式
4. **打包ZIP**：将markdown文件和images文件夹打包成chat-export.zip
5. **相对路径引用**：markdown中使用 `./images/image_001.png` 格式引用图片

**ZIP文件结构**：

```text
chat-export.zip
├── chat-export.md          # Markdown对话文件
└── images/                 # 图片文件夹
    ├── image_001.png
    ├── image_002.jpg
    └── ...
```

**使用提示**：

- 解压ZIP后，直接用Typora打开.md文件即可看到所有图片
- 图片和markdown文件的相对位置不要改变
- 如果对话中没有图片，仍会导出为ZIP格式

## 🔄 批量多对话导出功能 (v6.0新功能)

### 功能特点

一次性导出多个对话，所有内容打包到一个ZIP文件中，极大提高工作效率。

### 使用方法

1. **打开插件弹窗**，找到 "Multi-Conversation Export" 部分
2. **点击 "Load Conversation List"** 按钮加载当前账号的所有对话
3. **选择要导出的对话**：
   - 使用 "Select All" 全选
   - 使用 "Deselect All" 取消全选
   - 或手动勾选想要导出的对话
4. **点击 "Export Selected"** 开始批量导出
5. 等待进度条完成，自动下载ZIP文件

### ZIP文件结构

```text
multi-chat-export_2025-01-15.zip
├── README.txt                                    # 导出信息和目录
├── conversation_001_对话标题1/
│   ├── conversation.md
│   └── images/
│       ├── image_001.png
│       └── image_002.jpg
├── conversation_002_对话标题2/
│   ├── conversation.md
│   └── images/
│       └── image_001.png
└── ...
```

### 技术亮点

- ✅ **使用IndexedDB存储**：突破chrome.storage的5MB限制，支持大规模导出
- ✅ **智能导航**：自动在对话之间切换并等待页面加载
- ✅ **错误处理**：失败的对话会记录在README.txt中
- ✅ **进度显示**：实时显示导出进度和状态

## ⚡ 速度优化设置 (v6.2新功能)

### 可配置的延迟参数

在插件弹窗的 "⚙️ Speed Settings" 区域，可以调整两个关键参数：

#### 1. Page Load Wait (页面加载等待时间)

- **范围**: 1-10秒
- **默认值**: 2秒
- **说明**: 页面加载完成后额外等待时间，确保动态内容完全加载
- **建议**:
  - 网络快、对话简单：1-2秒
  - 网络慢、对话复杂：4-6秒
  - ⚠️ 过短可能导致内容缺失

#### 2. Delay Between Conversations (对话间延迟)

- **范围**: 0-5秒
- **默认值**: 0.5秒
- **说明**: 处理完一个对话后，等待多久再处理下一个
- **建议**:
  - 快速导出：0-0.5秒
  - 避免速率限制：1-2秒
  - ⚠️ 过短可能触发平台限制

### 推荐配置

| 使用场景 | Page Load Wait | Conversation Delay | 预估速度 |
|---------|---------------|-------------------|---------|
| **快速稳定** ⭐推荐 | 2秒 | 0.5秒 | 20个对话 ≈ 50秒 |
| **超快（冒险）** | 1秒 | 0秒 | 20个对话 ≈ 20秒 |
| **保守稳定** | 4秒 | 1.5秒 | 20个对话 ≈ 110秒 |
| **网络慢** | 5-6秒 | 2秒 | 20个对话 ≈ 140-160秒 |

### 如何调整

1. 打开插件弹窗
2. 拖动滑块到合适位置
3. 点击 "Save Settings" 保存
4. 设置立即生效，下次导出时使用新配置

## 📋 导出效果

导出的.md文件可以完美在Typora等Markdown编辑器中打开:

![image-20240208173402018](https://github.com/thisisbaiy/ChatGPT-To-Markdown-google-plugin/assets/96861449/f7a8d7fa-2edd-4118-92d8-72e920cdbfbf)

![image-20240208173511856](https://github.com/thisisbaiy/ChatGPT-To-Markdown-google-plugin/assets/96861449/d1b4a046-76e9-4330-803e-6188d1cf91df)

## 🌐 支持的平台

| 平台 | 状态 | 支持的功能 |
|------|------|------------|
| ChatGPT | ✅ 完全支持 | 代码块、数学公式、链接、列表、表格等 |
| Grok | ✅ 完全支持 | 代码块、数学公式、链接、格式化文本等 |
| Gemini | ✅ 支持 | 代码块、链接、列表、表格等 |

## 📜 许可证

本项目采用MIT许可证。详情请参阅LICENSE文件。

---

# 🚀 AI Chat Exporter

<div align="center">
  <h3>Easily Export AI Conversations to Standard Markdown Format</h3>
  <p>Support for ChatGPT, Grok, and Gemini platforms</p>
  
  ![License](https://img.shields.io/badge/License-MIT-blue.svg)
  ![Version](https://img.shields.io/badge/Version-6.2-green.svg)
  ![Platform](https://img.shields.io/badge/Platform-Chrome-orange.svg)
</div>

## ✨ Features

- 🔄 **Multi-platform Support**: Works with **ChatGPT**, **Grok**, and **Gemini**
- 📝 **Complete Content Preservation**: Accurately exports all conversation content, including **code blocks**, **mathematical formulas**, **links**, and **formatted text**
- 🎨 **Standard Markdown Format**: Outputs compliant Markdown format for optimal compatibility
- 💾 **Dual Export Options**: Download .md files directly or copy to clipboard
- 📦 **Automatic Image Download** (v5.5 New): Automatically downloads all images in conversations and packages them into a ZIP file
  - Images are saved in the `images/` folder
  - Named with sequential numbers (image_001.png, image_002.jpg, etc.)
  - Markdown uses relative paths for perfect Typora compatibility
- 🔄 **Batch Multi-Conversation Export** (v6.0 New): Export multiple conversations at once
  - Auto-load conversation list with selective export
  - Smart navigation and data collection
  - All conversations packaged into one ZIP file
  - Uses IndexedDB for large-scale exports
- ⚡ **Configurable Speed Settings** (v6.2 New): Flexible export speed adjustment
  - Adjustable page load wait time (1-10 seconds)
  - Adjustable delay between conversations (0-5 seconds)
  - Settings saved in real-time
  - Optimize speed based on network conditions
- 🖼️ **Typora Compatibility**: Specially optimized for correct display in Typora and other Markdown editors
- 🔘 **Interface Control**: Toggle the export button visibility through popup settings

## 🛠️ Installation

### Step 1: Download Repository

Clone or download this repository to your local computer.

### Step 2: Load Extension

![image-20240208173306163-1707387378543-1](https://github.com/thisisbaiy/ChatGPT-To-Markdown-google-plugin/assets/96861449/5a371f83-1a2a-422e-99c0-7317074f434f)

1. Open Chrome browser and go to the extensions page (chrome://extensions/)
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked"
4. Select the downloaded repository folder and confirm

### Step 3: Use Extension

![image-20240208173337825](https://github.com/thisisbaiy/ChatGPT-To-Markdown-google-plugin/assets/96861449/3e75a5bb-4a3d-459c-bfff-7a695a88a431)

When you open a supported AI platform (ChatGPT, Grok, or Gemini), you'll see the green "Export Chat" button on the page.

Usage:
1. Browse the conversation you want to export
2. Click the green "Export Chat" button to automatically download a ZIP package (containing Markdown file and all images)
3. Extract the ZIP file and open the .md file with Typora or other editors to view the complete conversation (with images)
4. Or click the extension icon and choose "Copy to Clipboard" to copy the content (plain text, no images)

**Note**: Exports with images will be downloaded as .zip files. After extraction, images will display correctly in Typora.

## 🔄 Batch Multi-Conversation Export (v6.0 New)

### Features

Export multiple conversations at once, all packaged into a single ZIP file for maximum efficiency.

### How to Use

1. **Open the extension popup**, find "Multi-Conversation Export" section
2. **Click "Load Conversation List"** to load all conversations from your account
3. **Select conversations to export**:
   - Use "Select All" to select all
   - Use "Deselect All" to deselect all
   - Or manually check the conversations you want
4. **Click "Export Selected"** to start batch export
5. Wait for the progress bar to complete, ZIP file will download automatically

### ZIP File Structure

```text
multi-chat-export_2025-01-15.zip
├── README.txt                                    # Export info and index
├── conversation_001_ConversationTitle1/
│   ├── conversation.md
│   └── images/
│       ├── image_001.png
│       └── image_002.jpg
├── conversation_002_ConversationTitle2/
│   ├── conversation.md
│   └── images/
│       └── image_001.png
└── ...
```

### Technical Highlights

- ✅ **Uses IndexedDB**: Breaks through chrome.storage 5MB limit for large-scale exports
- ✅ **Smart Navigation**: Automatically switches between conversations and waits for page loads
- ✅ **Error Handling**: Failed conversations are logged in README.txt
- ✅ **Progress Display**: Real-time progress and status updates

## ⚡ Speed Optimization Settings (v6.2 New)

### Configurable Delay Parameters

In the "⚙️ Speed Settings" section of the popup, you can adjust two key parameters:

#### 1. Page Load Wait

- **Range**: 1-10 seconds
- **Default**: 2 seconds
- **Description**: Additional wait time after page load to ensure dynamic content is fully loaded
- **Recommendations**:
  - Fast network, simple conversations: 1-2 seconds
  - Slow network, complex conversations: 4-6 seconds
  - ⚠️ Too short may cause missing content

#### 2. Delay Between Conversations

- **Range**: 0-5 seconds
- **Default**: 0.5 seconds
- **Description**: Wait time before processing next conversation
- **Recommendations**:
  - Fast export: 0-0.5 seconds
  - Avoid rate limiting: 1-2 seconds
  - ⚠️ Too short may trigger platform limits

### Recommended Configurations

| Scenario | Page Load Wait | Conversation Delay | Estimated Speed |
|----------|---------------|-------------------|-----------------|
| **Fast & Stable** ⭐Recommended | 2s | 0.5s | 20 conversations ≈ 50s |
| **Ultra-Fast (Risky)** | 1s | 0s | 20 conversations ≈ 20s |
| **Conservative** | 4s | 1.5s | 20 conversations ≈ 110s |
| **Slow Network** | 5-6s | 2s | 20 conversations ≈ 140-160s |

### How to Adjust

1. Open the extension popup
2. Drag sliders to desired positions
3. Click "Save Settings"
4. Settings take effect immediately for next export

## 📋 Export Results

The exported .md files can be perfectly opened in Markdown editors like Typora:

![image-20240208173402018](https://github.com/thisisbaiy/ChatGPT-To-Markdown-google-plugin/assets/96861449/f7a8d7fa-2edd-4118-92d8-72e920cdbfbf)

![image-20240208173511856](https://github.com/thisisbaiy/ChatGPT-To-Markdown-google-plugin/assets/96861449/d1b4a046-76e9-4330-803e-6188d1cf91df)

## 🌐 Supported Platforms

| Platform | Status | Supported Features |
|----------|--------|-------------------|
| ChatGPT | ✅ Full Support | Code blocks, math formulas, links, lists, tables, etc. |
| Grok | ✅ Full Support | Code blocks, math formulas, links, formatted text, etc. |
| Gemini | ✅ Supported | Code blocks, links, lists, tables, etc. |

## 📜 License

This project is licensed under the MIT License. See the LICENSE file for details.
