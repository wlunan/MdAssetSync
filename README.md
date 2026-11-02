# MdAssetSync

**English** | [简体中文](README.zh-CN.md)

MdAssetSync imports external Markdown files into Obsidian while preserving the original disk location used to resolve local images. A link such as `./assets/image.png` is resolved from the external Markdown file's original folder, then the image is copied into the attachment location configured in Obsidian.

This plugin is designed for Obsidian desktop and requires Node.js filesystem access.

## Features

- Select one or more external `.md` files with the operating system file picker.
- Start an import from the MdAssetSync ribbon button on the left sidebar or from the command palette.
- Resolve relative image paths from the original Markdown folder, including `./` and `../`.
- Resolve absolute local paths on Windows and macOS.
- Resolve Markdown inline images, reference-style images, Obsidian embeds, HTML `<img>` sources, and local `file://` URIs.
- Follow Obsidian's native **Files and links → Default location for new attachments** setting.
- Choose a separate destination folder for imported Markdown; the default is the vault root.
- Rewrite images as standard Markdown links: `![alt](relative/path.png)`.
- Reuse an existing attachment when both the file name and MD5 match.
- Handle same-name files with different content using append-MD5, overwrite, or skip strategies.
- Keep network images and base64 images unchanged.
- Show import progress and classify imported files, missing images, conflicts, and errors in the developer console.

## Installation

### Release archive

1. Extract `md-asset-sync-1.0.1.zip`.
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
2. Click the MdAssetSync image icon on the left ribbon, or run **MdAssetSync: Import external Markdown and sync images** from the command palette.
3. Select one or more external Markdown files.
4. Choose where the Markdown files should be written in the vault. The default is the vault root.
5. Wait for the import to finish and review the result notification and developer console.

The Markdown destination and the attachment destination are independent. Changing the Markdown target folder does not change where images are stored.

## Attachment behavior

| Obsidian attachment setting | MdAssetSync destination |
| --- | --- |
| Same folder as the current file | Markdown file's folder |
| Subfolder under the current file's folder | That subfolder beside the imported Markdown file |
| Vault folder | The configured vault folder |
| Setting unavailable | `assets` beside the imported Markdown file |

Existing attachments are checked by MD5 when the file names match. Matching content is reused. Different content follows the configured same-name strategy.

## Plugin language

Open **Settings → Community plugins → MdAssetSync** and choose **Plugin language**:

- English
- 简体中文

The default is English. The command, settings, dialogs, progress messages, notifications, and developer console results use the selected language.

## Supported image paths

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

Not processed:

- HTTP and HTTPS URLs
- `data:` base64 images
- Other network or application URI schemes

## Limitations

- Desktop only.
- HTML image sizing and styling attributes are discarded when converted to standard Markdown.
- Images inside inline code and fenced code blocks are preserved without processing.
- External Markdown files must remain readable during the import.
- If an imported Markdown file already exists in the destination folder, MdAssetSync adds an `-import-N` suffix rather than overwriting it.

## Release notes

See [CHANGELOG.md](CHANGELOG.md).

## License

This project is licensed under the [GNU General Public License v3.0 only](LICENSE).

MdAssetSync 1.0.0 was distributed under the MIT License. GPL-3.0-only applies to version 1.0.1 and later.
