# MdAssetSync

**English** | [简体中文](README.zh-CN.md)

MdAssetSync imports external Markdown files into Obsidian while preserving the original disk location used to resolve local assets. A link such as `./assets/image.png` is resolved from the external Markdown file's original folder, then the image or optional attachment is copied into the location configured in Obsidian.

This plugin is designed for Obsidian desktop and requires Node.js filesystem access.

## Features

- Select one or more external `.md` files with the operating system file picker.
- Start an import from the MdAssetSync ribbon button on the left sidebar or from the command palette.
- Resolve relative image paths from the original Markdown folder, including `./` and `../`.
- Resolve absolute local paths on Windows and macOS.
- Resolve Markdown inline images, reference-style images, Obsidian embeds, HTML `<img>` sources, and local `file://` URIs.
- Optionally copy local PDF, office, audio, video, archive, or custom attachment types referenced from the Markdown.
- Choose between disabled, PDF and office documents, all local attachments, or a custom extension list.
- Follow Obsidian's native **Files and links → Default location for new attachments** setting.
- Choose a separate destination folder for imported Markdown; the default is the vault root.
- Rewrite images as standard Markdown links: `![alt](relative/path.png)`.
- Preserve non-image attachment link, wiki-link, and wiki-embed syntax while rewriting only the local path.
- Reuse an existing attachment when both the file name and MD5 match.
- Handle same-name files with different content using append-MD5, overwrite, or skip strategies.
- Keep network images, base64 images, and remote attachment links unchanged.
- Show import progress and classify imported files, missing assets, conflicts, and errors in the developer console.

## Installation

### Release archive

1. Extract `md-asset-sync-1.1.0.zip`.
2. Create or open `<Vault>/.obsidian/plugins/md-asset-sync/`.
3. Copy `main.js` and `manifest.json` into that folder.
4. Restart Obsidian or reload third-party plugins.
5. Enable **MdAssetSync** in **Settings → Community plugins**.

### Build from source

Node.js 18 or newer is required.

```powershell
npm install
npm run build
```

Copy `main.js` and `manifest.json` to the plugin folder in the vault.

## Usage

1. Configure **Settings → Files and links → Default location for new attachments** in Obsidian.
2. In **Settings → Community plugins → MdAssetSync**, choose whether non-image attachments should be synchronized.
3. Click the MdAssetSync image icon on the left ribbon, or run **MdAssetSync: Import external Markdown and sync assets** from the command palette.
4. Select one or more external Markdown files.
5. Choose where the Markdown files should be written in the vault. The default is the vault root.
6. Wait for the import to finish and review the result notification and developer console.

The Markdown destination and the attachment destination are independent. Changing the Markdown target folder does not change where assets are stored.

## Attachment behavior

| Obsidian attachment setting | MdAssetSync destination |
| --- | --- |
| Same folder as the current file | Markdown file's folder |
| Subfolder under the current file's folder | That subfolder beside the imported Markdown file |
| Vault folder | The configured vault folder |
| Setting unavailable | `assets` beside the imported Markdown file |

Existing attachments are checked by MD5 when the file names match. Matching content is reused. Different content follows the configured same-name strategy.

## Non-image attachments

Use **Sync non-image attachments** in the plugin settings to choose a mode:

| Mode | Behavior |
| --- | --- |
| Off | Only image syntax is synchronized |
| PDF and office documents | Synchronizes PDF, Word, Excel, PowerPoint, TXT, RTF, and CSV files |
| All local attachments | Synchronizes every local file type except note-oriented `.md`, `.markdown`, `.canvas`, and `.base` files |
| Custom file extensions | Synchronizes only extensions listed in the custom extension field |

Custom extensions can be separated with commas or spaces. Leading dots are optional, and values are normalized case-insensitively. For example:

```text
pdf, docx, xlsx, epub, .drawio
```

Supported non-image syntax includes:

- `[guide](./files/guide.pdf)`
- `[report][doc]` with `[doc]: ../files/report.xlsx`
- `[[manual.pdf|Open manual]]`
- `![[recording.mp3]]`
- `<a href="./files/data.csv">Open data</a>`

Images are always rewritten to `![]()`. Non-image attachments retain their original link or embed syntax so Obsidian can keep opening or previewing the correct file type.

## Plugin language

Open **Settings → Community plugins → MdAssetSync** and choose **Plugin language**:

- English
- 简体中文

The default is English. The command, settings, dialogs, progress messages, notifications, and developer console results use the selected language.

## Supported asset paths

Supported:

- `![image](./assets/photo.png)`
- `![image](../shared/photo.png)`
- `![image](<my images/photo one.png>)`
- Reference images such as `![image][photo]` with `[photo]: ./photo.png`
- Obsidian embeds such as `![[./assets/photo.png]]` and `![[photo.png|alt text]]`
- HTML images such as `<img src="./photo.png" alt="image">`
- Local URIs such as `file:///C:/Images/photo.png`
- Windows absolute paths such as `C:/Images/photo.png`
- macOS absolute paths
- Percent-encoded local paths containing spaces
- `[guide](./files/guide.pdf)` for optional non-image attachments
- `[[manual.pdf|Open manual]]` and `![[recording.mp3]]` for optional non-image attachments

Not processed:

- HTTP and HTTPS URLs
- `data:` base64 images
- Other network or application URI schemes
- Image files in the non-image attachment flow; they are handled only by image syntax

## Limitations

- Desktop only.
- HTML image sizing and styling attributes are discarded when converted to standard Markdown.
- Images inside inline code and fenced code blocks are preserved without processing.
- Markdown, Canvas, and Base files are not copied as attachments.
- All-local mode can copy large audio, video, or archive files; choose a narrower mode when this is not desired.
- External Markdown files must remain readable during the import.
- If an imported Markdown file already exists in the destination folder, MdAssetSync adds an `-import-N` suffix rather than overwriting it.

## Release notes

See [CHANGELOG.md](CHANGELOG.md).

## License

This project is licensed under the [GNU General Public License v3.0 only](LICENSE).

MdAssetSync 1.0.0 was distributed under the MIT License. GPL-3.0-only applies to version 1.0.1 and later.
