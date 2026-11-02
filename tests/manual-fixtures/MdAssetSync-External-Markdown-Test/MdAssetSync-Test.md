# MdAssetSync 1.0.0 手动测试文档

> 使用 MdAssetSync 导入此 Markdown 文件。导入后，下面的本地图片应当显示；网络、base64、缺失图片和代码块内容应保持原来的写法。

## 1. 相对路径与百分号编码

![百分号编码的相对路径](./assets/relative%20image.png)

## 2. 尖括号和空格路径

![尖括号空格路径](<./assets/relative image.png>)

## 3. 上级目录相对路径

![上级目录图片](../shared/shared-image.png)

## 4. Windows 绝对路径

![绝对路径图片](E:/05projects/plugins-dev/obsidian/MdAssetSync/tests/manual-fixtures/MdAssetSync-External-Markdown-Test/absolute-image.png)

## 5. 本地 file URI

![本地 file URI](file:///E:/05projects/plugins-dev/obsidian/MdAssetSync/tests/manual-fixtures/MdAssetSync-External-Markdown-Test/assets/relative%20image.png)

## 6. 引用式图片

![完整引用式图片][reference-image]

![折叠引用式图片][]

![快捷引用式图片]

[reference-image]: ./assets/reference.png "引用标题"
[折叠引用式图片]: ./assets/reference.png
[快捷引用式图片]: ./assets/reference.png

## 7. Obsidian Wiki 嵌入

![[./assets/relative image.png|Obsidian Wiki 嵌入]]

## 8. HTML img 标签

<img src="./assets/relative image.png" alt="HTML 图片" width="480">

## 9. 网络图片：应保持原样

![网络图片](https://picsum.photos/id/10/640/360)

## 10. Base64 图片：应保持原样

![Base64 图片](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=)

## 11. 其他网络协议：应保持原样

![FTP 图片](ftp://example.com/image.png)

## 12. 缺失图片：应记录日志

![不存在的相对图片](./assets/does-not-exist.png)

![不存在的引用][missing-reference]

## 13. 代码块保护

行内代码：`![代码中的图片](./assets/relative image.png)`

```md
![围栏代码块中的图片](./assets/reference.png)
```

## 预期结果

- 导入后的图片全部使用标准 Markdown 语法 `![]()`。
- 原有 Wiki 嵌入 `![[...]]` 和 HTML `<img>` 中的本地图片已转换。
- `relative image.png` 会被多次引用，但附件目录中只保留一份相同内容文件。
- 本次应复制 4 个不同的本地图片：`relative image.png`、`shared-image.png`、`reference.png`、`absolute-image.png`。
- 网络图片、Base64 图片和 FTP 图片保持原链接。
- 缺失图片保留原链接，并在开发者控制台和结果通知中记录缺失项。
- 行内代码和围栏代码块中的图片文本保持原样。
- 如果附件目录里已有同名但内容不同的文件，则按插件设置中的“同名文件策略”处理。
