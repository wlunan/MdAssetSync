# MdAssetSync

[English](README.md) | **简体中文**

MdAssetSync 用于把外部 Markdown 文件导入 Obsidian，并保留解析本地资源所需的外部原始磁盘位置。例如 `./assets/image.png` 会以外部 Markdown 所在文件夹为基准解析，再把图片或可选附件复制到 Obsidian 原生附件设置指定的位置。

本插件仅支持 Obsidian 桌面端，依赖 Node.js 文件系统能力。

## 功能

- 通过系统文件选择框选择多个外部 `.md` 文件。
- 可从左侧 Ribbon 栏的 MdAssetSync 按钮或命令面板启动导入。
- 以外部 Markdown 的原始文件夹解析相对图片路径，支持 `./` 和 `../`。
- 支持 Windows 和 macOS 的绝对本地路径。
- 支持 Markdown 内联图片、引用式图片、Obsidian 图片嵌入、HTML `<img>` 本地来源和 `file://` 本地 URI。
- 可选同步 Markdown 引用的本地 PDF、办公文档、音频、视频、压缩包或自定义后缀文件。
- 附件同步支持“关闭”“PDF 和办公文档”“所有本地附件”和“自定义后缀”四种模式。
- 图片目录遵循 Obsidian 的“文件与链接 → 新附件的默认位置”设置。
- Markdown 目标目录单独选择，默认是 Vault 根目录。
- 图片统一改写为标准 Markdown 链接 `![alt](relative/path.png)`。
- 非图片附件保留普通链接、Wiki 链接或 Wiki 嵌入语法，只改写本地路径。
- 文件名和 MD5 均相同的附件直接复用。
- 同名但内容不同时，支持追加 MD5、覆盖或跳过。
- 网络图片、base64 图片和远程附件链接保持原样。
- 显示导入进度，并在开发者控制台分类输出成功、缺失资源、冲突和错误。

## 安装

### 使用发布包

1. 解压 `md-asset-sync-1.1.0.zip`。
2. 创建或打开 `<Vault>/.obsidian/plugins/md-asset-sync/`。
3. 将 `main.js` 和 `manifest.json` 复制到该目录。
4. 重启 Obsidian 或重载第三方插件。
5. 在“设置 → 第三方插件”中启用 MdAssetSync。

### 从源码构建

需要 Node.js 18 或更新版本。

```powershell
npm install
npm run build
```

将 `main.js` 和 `manifest.json` 复制到 Vault 的插件目录。

## 使用

1. 在 Obsidian 的“设置 → 文件与链接 → 新附件的默认位置”中配置附件目录。
2. 在“设置 → 第三方插件 → MdAssetSync”中选择是否同步图片以外的附件。
3. 点击左侧 Ribbon 栏的 MdAssetSync 图片图标，或从命令面板执行“MdAssetSync: 导入外部 Markdown 并同步资源”。
4. 选择一个或多个外部 Markdown 文件。
5. 选择 Markdown 在 Vault 中的写入位置，默认是 Vault 根目录。
6. 等待导入结束，查看结果通知和开发者控制台。

Markdown 目标目录与附件目录相互独立。修改 Markdown 目标目录不会改变资源文件的位置。

## 附件行为

| Obsidian 附件设置 | MdAssetSync 目标位置 |
| --- | --- |
| 当前文件所在文件夹 | Markdown 文件所在文件夹 |
| 当前文件所在文件夹的子文件夹 | 导入后 Markdown 同级的该子文件夹 |
| Vault 内指定文件夹 | 配置的 Vault 文件夹 |
| 无法读取设置 | Markdown 同级的 `assets` |

同名附件会先比较 MD5。内容一致时复用，内容不同时按设置中的同名文件策略处理。

## 非图片附件

在插件设置的“同步图片以外的附件”中选择模式：

| 模式 | 行为 |
| --- | --- |
| 关闭 | 只同步图片语法 |
| PDF 和办公文档 | 同步 PDF、Word、Excel、PowerPoint、TXT、RTF 和 CSV 文件 |
| 所有本地附件 | 同步所有本地文件类型，但排除 `.md`、`.markdown`、`.canvas` 和 `.base` |
| 自定义后缀 | 只同步自定义输入框中列出的后缀 |

自定义后缀可使用逗号或空格分隔，开头点号可省略，不区分大小写。例如：

```text
pdf, docx, xlsx, epub, .drawio
```

支持的非图片附件语法：

- `[说明书](./files/manual.pdf)`
- `[报表][doc]` 配合 `[doc]: ../files/report.xlsx`
- `[[manual.pdf|打开说明书]]`
- `![[recording.mp3]]`
- `<a href="./files/data.csv">打开数据</a>`

图片始终改写为 `![]()`。非图片附件会保留原链接或嵌入语法，确保 Obsidian 能继续打开或预览对应文件类型。

## 插件语言

在“设置 → 第三方插件 → MdAssetSync”中选择“插件语言”：

- English
- 简体中文

默认语言为 English。命令、设置、弹窗、进度提示、通知和开发者控制台结果会使用所选语言。

## 支持的资源路径

支持：

- `![image](./assets/photo.png)`
- `![image](../shared/photo.png)`
- `![image](<带 空格/photo one.png>)`
- `![image][photo]` 配合 `[photo]: ./photo.png` 的引用式图片
- `![[./assets/photo.png]]`、`![[photo.png|替代文字]]` 等 Obsidian 图片嵌入
- `<img src="./photo.png" alt="image">` 等 HTML 图片
- `file:///C:/Images/photo.png` 等本地文件 URI
- `C:/Images/photo.png` 等 Windows 绝对路径
- macOS 绝对路径
- 包含空格且使用百分号编码的本地路径
- `[说明书](./files/manual.pdf)` 等可选非图片附件
- `[[manual.pdf|打开说明书]]`、`![[recording.mp3]]` 等可选非图片附件

不处理：

- HTTP 和 HTTPS 地址
- `data:` base64 图片
- 其他网络或应用 URI 协议
- 非图片附件流程中的图片后缀；图片只通过图片语法处理

## 边界

- 仅支持桌面端。
- HTML 图片转换为标准 Markdown 后会丢失宽高和样式属性。
- 行内代码和围栏代码块中的图片文本会保持原样。
- Markdown、Canvas 和 Base 文件不会被当作附件复制。
- “所有本地附件”可能复制较大的音频、视频或压缩包；不需要时请使用更窄的模式。
- 导入期间外部 Markdown 文件必须保持可读。
- 目标目录已有同名 Markdown 时，将追加 `-import-N` 后缀，不覆盖原文档。

## 更新记录

见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

本项目使用 [GNU General Public License v3.0 only](LICENSE)。

MdAssetSync 1.0.0 曾以 MIT License 发布；从 1.0.1 开始使用 GPL-3.0-only。
