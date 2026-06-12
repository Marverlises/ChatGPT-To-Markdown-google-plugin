# ChatGPT to MarkDown plus

一款 Chrome 浏览器扩展，可将 **ChatGPT**、**Gemini**、**Grok**、**DeepSeek** 等 AI 聊天网站的对话导出为 Markdown 文件，支持单条导出、批量导出与剪贴板复制。

当前版本：**5.6** · Manifest V3

## 功能特性

### 单条对话导出

- 将当前页面的完整对话导出为 `.md` 文件
- 自动从页面标题生成文件名
- 支持将对话中的图片下载到 `images/` 子目录，并在 Markdown 中使用相对路径引用
- 导出文件头部包含 `source` 元数据，标明来源平台

### 复制到剪贴板

- 在弹窗中预览 Markdown 内容
- 一键复制到系统剪贴板

### 页面浮动按钮

- 在支持的网站右上角显示 **Export Chat** 按钮
- 可在扩展弹窗中通过开关控制显示/隐藏

### 批量导出

| 平台 | 批量导出 | 说明 |
|------|----------|------|
| ChatGPT | ✅ | 通过官方 API 拉取会话列表，导出前会自动刷新页面以捕获认证信息 |
| Gemini | ✅ | 通过页面内部接口拉取历史会话 |
| Grok | ❌ | 仅支持当前页单条导出 |
| DeepSeek | ❌ | 仅支持当前页单条导出 |

批量导出支持暂停、继续、停止，失败时自动重试，并在页面右下角显示进度面板。

### ChatGPT 取消归档

- 一键对所有 ChatGPT 会话发起取消归档请求
- 支持暂停、继续、停止与失败重试
- 仅在 ChatGPT 页面可用

### Markdown 转换能力

HTML 转 Markdown 时支持：

- 数学公式（KaTeX / LaTeX）
- 加粗、斜体、行内代码、代码块
- 链接、图片、列表、标题、段落
- 表格、引用块

各平台通过独立的 Provider 适配 DOM 结构与 API 差异。

## 支持的网站

| 平台 | 域名 |
|------|------|
| ChatGPT | `chatgpt.com`、`*.chatgpt.com`、`*.openai.com` |
| Gemini | `gemini.google.com` |
| Grok | `grok.com`、`*.grok.com` |
| DeepSeek | `chat.deepseek.com`、`*.deepseek.com` |

## 安装方法

### 从源码加载（开发者模式）

1. 克隆或下载本仓库到本地
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择本项目根目录
5. 打开任意支持的 AI 聊天网站，点击浏览器工具栏中的扩展图标即可使用

> 扩展图标文件（`image16.png`、`image48.png`、`image128.png`）需存在于项目根目录，否则加载时可能提示缺少资源。

## 使用方法

### 通过扩展弹窗

点击浏览器工具栏中的扩展图标，在弹窗中可选择：

| 按钮 | 功能 |
|------|------|
| **Export as Markdown** | 导出当前对话为 `.md` 文件 |
| **Bulk Export** | 批量导出当前平台的所有历史会话（ChatGPT / Gemini） |
| **Unarchive All ChatGPT Chats** | 取消归档所有 ChatGPT 会话 |
| **Copy to Clipboard** | 复制当前对话为 Markdown |
| **Show 'Export Chat' button** | 切换页面浮动导出按钮的显示 |

### 通过页面按钮

在支持的网站上，页面右上角会显示绿色的 **Export Chat** 按钮，点击即可直接导出当前对话。

### 批量导出注意事项

- **ChatGPT**：点击批量导出后页面会自动刷新，刷新完成后自动开始导出；请保持已登录状态
- **Gemini**：直接在原页面开始导出，无需刷新
- 批量导出会在请求之间加入随机延迟，以降低触发限流的风险
- 导出文件默认保存到浏览器下载目录下的 `chatgpt-bulk-export/` 或 `gemini-bulk-export/` 子文件夹

## 项目结构

```
.
├── manifest.json              # 扩展清单（Manifest V3）
├── background.js              # Service Worker：下载、请求头捕获、批量导出调度
├── content.js                 # 内容脚本：导出逻辑、UI、HTML→Markdown 转换
├── popup.html / popup.js      # 扩展弹窗界面
├── sites.js                   # 支持的网站注册表
└── providers/
    ├── provider-registry.js   # Provider 注册中心
    ├── chatgpt-provider.js    # ChatGPT 适配（含批量导出、取消归档）
    ├── gemini-provider.js     # Gemini 适配（含批量导出）
    ├── grok-provider.js       # Grok 适配
    └── deepseek-provider.js   # DeepSeek 适配
```

## 架构说明

扩展采用 **站点注册表 + Provider 插件** 的分层设计：

- **`sites.js`**：定义各平台的域名匹配、权限、批量导出配置
- **`providers/*.js`**：各平台独立的 DOM 解析、API 调用、图片本地化逻辑
- **`content.js`**：统一的导出流程、Markdown 转换、批量任务调度
- **`background.js`**：文件下载、ChatGPT 认证头捕获、页面刷新后自动续跑批量任务

新增平台时，只需添加对应的 Site 配置和 Provider 实现，并在 `manifest.json` 中注册脚本即可。

## 权限说明

扩展申请以下权限以完成核心功能：

| 权限 | 用途 |
|------|------|
| `tabs` | 获取当前标签页并向内容脚本发送消息 |
| `webRequest` | 捕获 ChatGPT 页面的认证请求头（用于批量导出 API） |
| `downloads` | 下载 Markdown 文件与对话中的图片 |
| `scripting` | 在页面未连接时重新注入内容脚本 |
| `host_permissions` | 访问各 AI 聊天网站的页面与 API |

## 常见问题

**导出按钮没有出现？**

- 确认当前网站在支持列表中
- 检查弹窗中的 **Show 'Export Chat' button** 开关是否开启
- 尝试刷新页面

**批量导出提示无法连接页面？**

- 刷新目标网站页面后重试
- 在 `chrome://extensions/` 中重新加载扩展

**ChatGPT 批量导出没有数据？**

- 确认已登录 ChatGPT 账号
- 批量导出前会刷新页面，请勿在刷新完成前关闭标签页

**图片没有下载？**

- 部分图片受平台鉴权保护，可能下载失败；失败时 Markdown 中仍保留原始图片 URL

## 许可证

本项目基于 [Apache License 2.0](LICENSE) 开源。

## 作者与致谢

本项目基于 yebv 的开源作品二次开发。

- **当前维护**：allen
- **原作者**：yebv
