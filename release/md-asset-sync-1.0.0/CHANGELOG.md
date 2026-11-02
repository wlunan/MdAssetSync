# Changelog

All notable changes to MdAssetSync are documented here.

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
