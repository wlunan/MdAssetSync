# MdAssetSync

[English](README.md) | **简体中文**

MdAssetSync 用于把外部 Markdown 文件导入 Obsidian，并保留解析本地图片所需的外部原始磁盘位置。例如 `./assets/image.png` 会以外部 Markdown 所在文件夹为基准解析，再复制到 Obsidian 原生附件设置指定的位置。

本插件仅支持 Obsidian 桌面端，依赖 Node.js 文件系统能力。

## 功能

- 通过系统文件选择框选择多个外部 `.md` 文件。
- 以外部 Markdown 的原始文件夹解析相对图片路径，支持 `./` 和 `../`。
- 支持 Windows 和 macOS 的绝对本地路径。
- 图片目录遵循 Obsidian 的“文件与链接 → 新附件的默认位置”设置。
- Markdown 目标目录单独选择，默认是 Vault 根目录。
- 图片统一改写为标准 Markdown 链接 `![alt](relative/path.png)`。
- 文件名和 MD5 均相同的附件直接复用。
- 同名但内容不同时，支持追加 MD5、覆盖或跳过。
- 网络图片和 base64 图片保持原样。
- 显示导入进度，并在开发者控制台分类输出成功、缺失图片、冲突和错误。

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
2. 从命令面板执行“MdAssetSync: 导入外部Markdown并同步图片资源”。
3. 选择一个或多个外部 Markdown 文件。
4. 选择 Markdown 在 Vault 中的写入位置，默认是 Vault 根目录。
5. 等待导入结束，查看结果通知和开发者控制台。

Markdown 目标目录与附件目录相互独立。修改 Markdown 目标目录不会改变图片附件的位置。

## 附件行为

| Obsidian 附件设置 | MdAssetSync 目标位置 |
| --- | --- |
| 当前文件所在文件夹 | Markdown 文件所在文件夹 |
| 当前文件所在文件夹的子文件夹 | 导入后 Markdown 同级的该子文件夹 |
| Vault 内指定文件夹 | 配置的 Vault 文件夹 |
| 无法读取设置 | Markdown 同级的 `assets` |

同名附件会先比较 MD5。内容一致时复用，内容不同时按设置中的同名文件策略处理。

## 插件语言

在“设置 → 第三方插件 → MdAssetSync”中选择“插件语言”：

- English
- 简体中文

默认语言为 English。命令、设置、弹窗、进度提示、通知和开发者控制台结果会使用所选语言。

## 支持的图片路径

支持：

- `![image](./assets/photo.png)`
- `![image](../shared/photo.png)`
- `C:/Images/photo.png` 等 Windows 绝对路径
- macOS 绝对路径
- 包含空格且使用百分号编码的本地路径

不处理：

- HTTP 和 HTTPS 地址
- `data:` base64 图片
- HTML `<img>` 元素
- `![[photo.png]]` 等 Wiki 图片链接

## 边界

- 仅支持桌面端。
- 只解析标准 Markdown 图片语法。
- 导入期间外部 Markdown 文件必须保持可读。
- 目标目录已有同名 Markdown 时，将追加 `-import-N` 后缀，不覆盖原文档。

## 更新记录

见 [CHANGELOG.md](CHANGELOG.md)。
