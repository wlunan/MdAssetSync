# Changelog

All notable changes to MdAssetSync are documented here.

## 1.1.2 - 2026-11-03

### Release reliability and community review

- Upload `main.js` and `manifest.json` explicitly, verify both release assets, and then publish the GitHub release automatically.
- Add local Node.js type declarations so community scanners do not treat the desktop filesystem APIs as `any`.
- Remove unnecessary regular-expression escapes and unsafe exception handling.
- Replace developer-console import summaries with an in-app import-result dialog.

## 1.1.1 - 2026-11-03

### Community directory review

- Add a GitHub Actions release workflow that builds the plugin and creates verifiable build provenance attestations for `main.js`.
- Adopt Obsidian's declarative settings API; version 1.1.1 now requires Obsidian 1.13.0 or later.
- List Vault folders with `Vault.getAllFolders()` when choosing the Markdown destination.
- Replace the fallback file picker's direct DOM creation with Obsidian's `createEl()` helper.
- Document local filesystem access and privacy boundaries in both READMEs.

## 1.1.0 - 2026-11-03

### Non-image attachments

- Add optional synchronization for non-image files referenced by imported Markdown.
- Support disabled, PDF and office documents, all local attachments, and custom file extension modes.
- Normalize custom extension lists from comma-, Chinese comma-, semicolon-, or whitespace-separated input.
- Support Markdown inline links, reference links, Obsidian wiki links, wiki embeds, and HTML `<a>` links.
- Resolve attachment paths from the original Markdown directory and mirror them into the configured Obsidian attachment location.
- Reuse existing files with matching names and MD5 hashes, and apply the existing same-name collision strategy when content differs.
- Preserve non-image attachment link and embed syntax while rewriting local paths.
- Skip network links, non-file URI schemes, images handled by the image flow, and note-oriented Markdown, Canvas, and Base files.
- Report missing images and attachments together in the import result.

## 1.0.2 - 2026-11-02

### Community directory review

- Render the plugin settings heading with Obsidian's `Setting.setHeading()` API.
- Apply the hidden file input style with `setCssStyles()` instead of assigning directly to `style`.

## 1.0.1 - 2026-11-02

### License

- Relicense MdAssetSync from MIT to GPL-3.0-only for version 1.0.1 and later.
- Keep the previously published 1.0.0 release and the rights already granted for it under the MIT License unchanged.

## 1.0.0 - 2026-11-02

Initial public release.

### Import workflow

- Import one or more external Markdown files through the operating system file picker.
- Start an import from the MdAssetSync ribbon button or the command palette.
- Choose a separate Markdown destination folder in the vault; the default is the vault root.
- Show progress, keep importing after individual file failures, and report imported, failed, missing, and conflicting items.

### Image resolution

- Resolve relative paths from the external Markdown file's original disk folder, including `./` and `../`.
- Support Windows and macOS absolute paths, percent-encoded paths, Markdown escapes, and destinations enclosed in angle brackets.
- Support Markdown inline images, titles, reference definitions, collapsed references, and shortcut references.
- Support Obsidian embeds such as `![[image.png]]` and `![[image.png|alt text]]`.
- Support HTML `<img>` sources and local `file://` URIs.
- Support Chinese and other Unicode file names and paths.
- Preserve images inside inline code and fenced code blocks.
- Leave HTTP, HTTPS, base64, FTP, and other remote URI images unchanged.

### Attachment handling

- Follow Obsidian's native default attachment location setting.
- Keep the Markdown destination independent from the attachment destination.
- Fall back to a sibling `assets` folder when the native attachment setting cannot be read.
- Compare same-name attachments by MD5 and reuse files with identical content.
- Support append-MD5, overwrite, and skip strategies when same-name files have different content.
- Rewrite imported images as standard Markdown links `![]()`.
- Keep or remove missing local image links according to the plugin setting.

### Interface and localization

- Provide an Obsidian settings panel.
- Support English and Simplified Chinese; English is the default.
- Localize commands, settings, dialogs, progress messages, notifications, and developer console results.
- Provide an English README, a Simplified Chinese README, and a manual test fixture.

### Stability

- Prevent concurrent import runs.
- Use Obsidian Vault APIs for Markdown, attachment, and folder writes.
- Keep progress state and notifications clean when startup or individual imports fail.
