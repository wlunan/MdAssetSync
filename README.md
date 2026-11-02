# MdAssetSync

仅适用于 Obsidian 桌面端的 Markdown 导入插件。它在导入前读取外部 Markdown 的原始磁盘目录，因此 `./assets/image.png` 和 `../image.png` 会按外部文件的位置解析，再复制到 Vault 中 Obsidian 原生附件设置所指定的位置。

## 使用方法

1. 在 Obsidian 设置的“文件与链接”中配置附件默认存放位置。
2. 将编译生成的 `main.js` 和 `manifest.json` 放入 `<Vault>/.obsidian/plugins/md-asset-sync/`。
3. 重启 Obsidian 或在“第三方插件”中刷新并启用 MdAssetSync。
4. 执行命令“MdAssetSync: 导入外部Markdown并同步图片资源”。
5. 在系统文件选择框中选择一个或多个 `.md` 文件，再在弹窗中选择 Vault 内的目标文件夹。

插件只处理 `![alt](path)` 形式的本地图片。HTTP/HTTPS 和 `data:` 内嵌图片会保留原文，不会下载。处理结束后，开发者控制台会输出成功、缺失图片和文件冲突的完整清单。

## 编译与打包

需要 Node.js 18 或更新版本：

```powershell
npm install
npm run build
```

发布或本地安装时只需复制下列产物到插件目录：

```text
main.js
manifest.json
```
