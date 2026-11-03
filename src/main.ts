import {
	App,
	Modal,
	Notice,
	Platform,
	Plugin,
	PluginSettingTab,
	Setting,
	type SettingDefinitionItem,
	setTooltip,
	TFile,
	TFolder,
	normalizePath
} from "obsidian";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

type CollisionStrategy = "append-md5" | "overwrite" | "skip";
type PluginLanguage = "en" | "zh-CN";
type AttachmentSyncMode = "off" | "office" | "all" | "custom";

interface MdAssetSyncSettings {
	language: PluginLanguage;
	collisionStrategy: CollisionStrategy;
	keepMissingAssetLinks: boolean;
	attachmentSyncMode: AttachmentSyncMode;
	customAttachmentExtensions: string;
}

interface ImportLog {
	importedMarkdown: string[];
	reusedAssets: string[];
	missingAssets: string[];
	conflicts: string[];
	errors: string[];
	skippedRemoteOrEmbedded: number;
}

interface ElectronDialog {
	showOpenDialog(options: {
		properties: string[];
		filters?: Array<{ name: string; extensions: string[] }>;
	}): Promise<{ canceled: boolean; filePaths: string[] }>;
}

interface ParsedImageSyntax {
	altText: string;
	imageReference: string;
	original: string;
	isWikiEmbed?: boolean;
	unresolvedReference?: string;
}

type AttachmentSyntaxKind = "markdown-inline" | "markdown-reference" | "wiki-link" | "wiki-embed" | "html-link";

interface ParsedAttachmentSyntax {
	alias?: string;
	kind: AttachmentSyntaxKind;
	label: string;
	original: string;
	reference: string;
	unresolvedReference?: string;
}

interface AttachmentMatch {
	kind: AttachmentSyntaxKind;
	match: RegExpMatchArray;
}

const TRANSLATIONS = {
	en: {
		commandName: "Import external Markdown and sync assets",
		desktopOnly: "MdAssetSync is available on Obsidian desktop only.",
		importInProgress: "MdAssetSync: an import is already running. Wait for it to finish.",
		progressPreparing: (target: string) => `MdAssetSync: preparing to import Markdown to ${target}…`,
		progressImporting: (current: number, total: number, fileName: string) =>
			`MdAssetSync: importing ${current}/${total}: ${fileName}`,
		cannotStartImport: "MdAssetSync: unable to start the import. Try again.",
		pathIsNotFile: "The path is not a file.",
		referenceDefinitionNotFound: (label: string) => `Reference definition not found: ${label}`,
		assetNotFound: "Asset not found",
		reusedSameName: "Same file name and content, reusing the existing asset",
		skippedSameName: "Different file with the same name was skipped",
		cannotOverwriteFolder: (folderPath: string) => `Cannot overwrite a folder with the same name: ${folderPath}`,
		overwrittenSameName: "Different file with the same name was overwritten",
		reusedMd5Conflict: "Reused a conflicting asset with the same MD5",
		conflictAppended: "Asset conflict: an MD5 suffix was added",
		hashCompareFailed: "Could not compare the existing file; treating it as a conflict",
		unsafeAttachmentFolder: "Ignoring an unsafe Obsidian attachment folder setting",
		attachmentConfigReadFailed: "Could not read the Obsidian attachment setting; using the assets fallback",
		attachmentPathOccupied: (folderPath: string) => `Attachment folder path is occupied by a file: ${folderPath}`,
		markdownRenamed: "A Markdown file with the same name was renamed for import",
		importFailed: "Failed to import Markdown",
		reportHeading: "Import results",
		reportImported: "Imported Markdown:",
		reportReused: "Reused assets:",
		reportSkipped: "Skipped remote or embedded image references:",
		reportMissing: "Missing assets:",
		reportConflicts: "File conflicts:",
		reportErrors: "Import errors:",
		resultNotice: (imported: number, failed: number, missing: number, conflicts: number) =>
			`MdAssetSync: ${imported} imported; ${failed} failed; ${missing} missing assets; ${conflicts} conflicts.`,
		languageName: "Plugin language",
		languageDesc: "Choose the language used by commands, settings, dialogs, and notifications.",
		languageEnglish: "English",
		languageChinese: "简体中文",
		collisionName: "Same-name file strategy",
		collisionDesc: "Same-name assets are checked by MD5 first. Matching content is reused; different content follows this strategy.",
		collisionAppend: "Reuse matches; append MD5 when different",
		collisionOverwrite: "Reuse matches; overwrite when different",
		collisionSkip: "Reuse matches; warn and skip when different",
		attachmentModeName: "Sync non-image attachments",
		attachmentModeDesc:
			"Choose which local files referenced by the imported Markdown should be copied. Images are always handled separately.",
		attachmentModeOff: "Off",
		attachmentModeOffice: "PDF and office documents",
		attachmentModeAll: "All local attachments",
		attachmentModeCustom: "Custom file extensions",
		customExtensionsName: "Custom attachment extensions",
		customExtensionsDesc:
			"Separate extensions with commas or spaces. Leading dots are optional and wildcards are not supported. Leave empty to sync no non-image attachments.",
		customExtensionsPlaceholder: "pdf, docx, xlsx, epub",
		customExtensionsEmpty: "MdAssetSync: no custom attachment extensions are configured; only images will be synced.",
		linkFormatName: "Output link format",
		linkFormatDesc:
			"Images are output as standard Markdown links ![](). Non-image attachments keep their original link or embed syntax with a rewritten local path.",
		linkFormatValue: "Standard Markdown ![]()",
		keepMissingName: "Keep original links for missing assets",
		keepMissingDesc:
			"When disabled, missing local image and attachment links are removed. Remote and base64 images are always kept.",
		importUsageName: "Importing Markdown",
		importUsageDesc:
			"Run the import command, then choose Markdown files or a folder. Folder imports recursively include .md and .markdown files; hidden folders and node_modules are skipped. Imported notes are written to the destination you choose, without preserving the source folder structure.",
		sourcePickerHeading: "Choose an import source",
		sourcePickerDesc: "Choose Markdown files or a folder containing Markdown files.",
		chooseFiles: "Choose Markdown files",
		chooseFolder: "Choose a folder",
		folderModalHeading: "Choose the Markdown import location",
		folderModalDesc:
			"This choice controls only where Markdown files are written. Assets follow the attachment location configured in Obsidian Settings → Files and links.",
		markdownFolderName: "Markdown destination folder",
		markdownFolderDesc: "Defaults to the vault root. This is independent of the attachment folder and does not affect asset placement.",
		vaultRoot: "Vault root",
		cancel: "Cancel",
		importHere: "Import here",
		markdownFilter: "Markdown"
	},
	"zh-CN": {
		commandName: "导入外部 Markdown 并同步资源",
		desktopOnly: "MdAssetSync 仅支持 Obsidian 桌面端。",
		importInProgress: "MdAssetSync：已有导入任务正在进行，请等待完成。",
		progressPreparing: (target: string) => `MdAssetSync：将 Markdown 导入到 ${target}，正在准备…`,
		progressImporting: (current: number, total: number, fileName: string) =>
			`MdAssetSync：正在导入 ${current}/${total}：${fileName}`,
		cannotStartImport: "MdAssetSync：无法启动导入，请重试。",
		pathIsNotFile: "路径不是文件",
		referenceDefinitionNotFound: (label: string) => `找不到引用定义：${label}`,
		assetNotFound: "找不到资源文件",
		reusedSameName: "同名且内容相同，复用已有资源",
		skippedSameName: "同名资源内容不同，已跳过",
		cannotOverwriteFolder: (folderPath: string) => `无法覆盖同名文件夹：${folderPath}`,
		overwrittenSameName: "同名资源内容不同，已覆盖",
		reusedMd5Conflict: "已复用相同 MD5 的冲突资源",
		conflictAppended: "同名资源冲突，已追加 MD5 后缀",
		hashCompareFailed: "无法比较同名文件内容，将按冲突处理",
		unsafeAttachmentFolder: "忽略不安全的 Obsidian 附件目录配置",
		attachmentConfigReadFailed: "无法读取 Obsidian 附件设置，将使用 assets 兜底目录",
		attachmentPathOccupied: (folderPath: string) => `附件目录路径被文件占用：${folderPath}`,
		markdownRenamed: "同名 Markdown 已改名导入",
		importFailed: "导入 Markdown 失败",
		reportHeading: "导入结果",
		reportImported: "成功导入 Markdown：",
		reportReused: "复用已有资源：",
		reportSkipped: "跳过网络或内嵌图片引用：",
		reportMissing: "找不到的资源：",
		reportConflicts: "冲突文件：",
		reportErrors: "导入失败：",
		resultNotice: (imported: number, failed: number, missing: number, conflicts: number) =>
			`MdAssetSync：成功 ${imported} 个；失败 ${failed} 个；找不到资源 ${missing} 个；冲突 ${conflicts} 个。`,
		languageName: "插件语言",
		languageDesc: "选择命令、设置、弹窗和通知所使用的语言。",
		languageEnglish: "English",
		languageChinese: "简体中文",
		collisionName: "同名文件策略",
		collisionDesc: "同名资源会先比较 MD5：内容一致时直接复用；内容不一致时按下列策略处理。",
		collisionAppend: "相同复用；不同追加 MD5 后缀",
		collisionOverwrite: "相同复用；不同直接覆盖",
		collisionSkip: "相同复用；不同跳过并警告",
		attachmentModeName: "同步图片以外的附件",
		attachmentModeDesc: "选择是否复制外部 Markdown 引用的本地附件。图片始终由独立流程处理。",
		attachmentModeOff: "关闭",
		attachmentModeOffice: "PDF 和办公文档",
		attachmentModeAll: "所有本地附件",
		attachmentModeCustom: "自定义后缀",
		customExtensionsName: "自定义附件后缀",
		customExtensionsDesc: "使用逗号或空格分隔，开头点号可省略，不支持通配符；留空表示不同步非图片附件。",
		customExtensionsPlaceholder: "pdf, docx, xlsx, epub",
		customExtensionsEmpty: "MdAssetSync：尚未配置自定义附件后缀，本次只会同步图片。",
		linkFormatName: "输出链接格式",
		linkFormatDesc:
			"图片固定输出为标准 Markdown 链接 ![]()；非图片附件保留原链接或嵌入语法，仅改写本地路径。",
		linkFormatValue: "标准 Markdown ![]()",
		keepMissingName: "保留找不到资源的原始链接",
		keepMissingDesc: "关闭后，找不到的本地图片和附件会从 Markdown 正文移除；网络和 base64 图片始终保留。",
		importUsageName: "导入 Markdown",
		importUsageDesc:
			"运行导入命令后，可选择 Markdown 文件或文件夹。选择文件夹时会递归导入其中的 .md 和 .markdown 文件，并跳过隐藏文件夹和 node_modules。导入后的笔记会写入随后选择的目标目录，不保留源文件夹层级。",
		sourcePickerHeading: "选择导入来源",
		sourcePickerDesc: "请选择 Markdown 文件，或包含 Markdown 文件的文件夹。",
		chooseFiles: "选择 Markdown 文件",
		chooseFolder: "选择文件夹",
		folderModalHeading: "选择 Markdown 导入位置",
		folderModalDesc:
			"此选择只决定 Markdown 文件的位置。图片和附件会遵循 Obsidian“设置 → 文件与链接”中的附件默认存放位置。",
		markdownFolderName: "Markdown 目标文件夹",
		markdownFolderDesc: "默认 Vault 根目录。这里独立于附件目录，资源文件不会依据此选项决定存放位置。",
		vaultRoot: "Vault 根目录",
		cancel: "取消",
		importHere: "导入到此位置",
		markdownFilter: "Markdown"
	}
} satisfies Record<PluginLanguage, object>;

type Translation = (typeof TRANSLATIONS)["en"];

const DEFAULT_SETTINGS: MdAssetSyncSettings = {
	language: "en",
	collisionStrategy: "append-md5",
	keepMissingAssetLinks: true,
	attachmentSyncMode: "off",
	customAttachmentExtensions: ""
};
const ATTACHMENT_SYNC_MODES: AttachmentSyncMode[] = ["off", "office", "all", "custom"];
const COLLISION_STRATEGIES: CollisionStrategy[] = ["append-md5", "overwrite", "skip"];

// Square brackets are written as hex escapes to keep the patterns lint-clean.
// Supports inline Markdown images, reference-style images, and Obsidian embeds.
const IMAGE_SYNTAX_PATTERN =
	/!\x5b([^\n\x5d]*)\x5d\(\s*(<[^>\n]+>|(?:\\.|[^\s)])+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)|!\x5b([^\n\x5d]*)\x5d\x5b([^\n\x5d]*)\x5d|!\x5b\x5b([^\n\x5d]+)\x5d\x5d|!\x5b([^\n\x5d]+)\x5d(?![(\x5b])|<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi;
const REFERENCE_DEFINITION_PATTERN =
	/^ {0,3}\x5b([^\n\x5d]+)\x5d:[ \t]*(?:<([^>\n]+)>|(\S+))(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*\r?$/gm;
const ATTACHMENT_INLINE_PATTERN =
	/(?<!!)\x5b([^\n\x5d]+)\x5d\(\s*(<[^>\n]+>|(?:\\.|[^\s)])+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const ATTACHMENT_REFERENCE_PATTERN = /(?<!!)\x5b([^\n\x5d]+)\x5d\x5b([^\n\x5d]*)\x5d/g;
const WIKI_LINK_PATTERN = /(?<!!)\x5b\x5b([^\n\x5d]+)\x5d\x5d/g;
const WIKI_EMBED_PATTERN = /!\x5b\x5b([^\n\x5d]+)\x5d\x5d/g;
const HTML_ATTACHMENT_PATTERN = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>[\s\S]*?<\/a>/gi;

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);
const EXCLUDED_ATTACHMENT_EXTENSIONS = new Set(["base", "canvas", "markdown", "md"]);
const OFFICE_ATTACHMENT_EXTENSIONS = new Set([
	"pdf",
	"doc",
	"docx",
	"xls",
	"xlsx",
	"ppt",
	"pptx",
	"txt",
	"rtf",
	"csv"
]);

export default class MdAssetSyncPlugin extends Plugin {
	settings: MdAssetSyncSettings = DEFAULT_SETTINGS;
	private isImporting = false;
	private importCommand: { name: string } | null = null;
	private ribbonIconEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.importCommand = this.addCommand({
			id: "import-external-markdown-and-assets",
			name: this.t().commandName,
			callback: () => this.importExternalMarkdown()
		});
		this.ribbonIconEl = this.addRibbonIcon("images", this.t().commandName, () => this.importExternalMarkdown());

		this.addSettingTab(new MdAssetSyncSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		const savedSettings = (await this.loadData()) as
			| (Partial<MdAssetSyncSettings> & { keepMissingImageLinks?: boolean })
			| null;
		const { keepMissingImageLinks, ...storedSettings } = savedSettings ?? {};
		this.settings = { ...DEFAULT_SETTINGS, ...storedSettings };
		if (typeof savedSettings?.keepMissingAssetLinks === "boolean") {
			this.settings.keepMissingAssetLinks = savedSettings.keepMissingAssetLinks;
		} else if (typeof keepMissingImageLinks === "boolean") {
			this.settings.keepMissingAssetLinks = keepMissingImageLinks;
		}
		if (!Object.hasOwn(TRANSLATIONS, this.settings.language)) {
			this.settings.language = DEFAULT_SETTINGS.language;
		}
		if (!ATTACHMENT_SYNC_MODES.includes(this.settings.attachmentSyncMode)) {
			this.settings.attachmentSyncMode = DEFAULT_SETTINGS.attachmentSyncMode;
		}
		this.settings.customAttachmentExtensions =
			typeof this.settings.customAttachmentExtensions === "string"
				? normalizeCustomExtensions(this.settings.customAttachmentExtensions).join(", ")
				: DEFAULT_SETTINGS.customAttachmentExtensions;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshInterfaceLabels(): void {
		if (this.importCommand) {
			this.importCommand.name = this.t().commandName;
		}
		if (this.ribbonIconEl) {
			setTooltip(this.ribbonIconEl, this.t().commandName);
		}
	}

	t(): Translation {
		return TRANSLATIONS[this.settings.language];
	}

	private async importExternalMarkdown(): Promise<void> {
		if (!Platform.isDesktopApp) {
			new Notice(this.t().desktopOnly);
			return;
		}
		if (this.isImporting) {
			new Notice(this.t().importInProgress);
			return;
		}

		this.isImporting = true;
		let progress: Notice | null = null;
		try {
			const sourcePaths = await chooseMarkdownFiles(this.app, this.t());
			if (sourcePaths.length === 0) {
				return;
			}

			const targetFolder = await chooseVaultFolder(this.app, this.t());
			if (targetFolder === null) {
				return;
			}
			if (
				this.settings.attachmentSyncMode === "custom" &&
				normalizeCustomExtensions(this.settings.customAttachmentExtensions).length === 0
			) {
				new Notice(this.t().customExtensionsEmpty, 6000);
			}
			const targetFolderLabel = targetFolder || this.t().vaultRoot;
			const log: ImportLog = {
				importedMarkdown: [],
				reusedAssets: [],
				missingAssets: [],
				conflicts: [],
				errors: [],
				skippedRemoteOrEmbedded: 0
			};
			progress = new Notice(this.t().progressPreparing(targetFolderLabel), 0);

			for (let index = 0; index < sourcePaths.length; index += 1) {
				const sourcePath = sourcePaths[index];
				progress.setMessage(this.t().progressImporting(index + 1, sourcePaths.length, path.basename(sourcePath)));
				try {
					await this.importOneMarkdown(sourcePath, targetFolder, log);
				} catch {
					log.errors.push(`${sourcePath}: ${this.t().importFailed}`);
				}
			}

			this.reportImportResult(log);
		} catch {
			new Notice(this.t().cannotStartImport, 8000);
		} finally {
			progress?.hide();
			this.isImporting = false;
		}
	}

	private async importOneMarkdown(sourcePath: string, targetFolder: string, log: ImportLog): Promise<void> {
		const originalDir = path.dirname(sourcePath);
		const sourceMarkdown = await fs.readFile(sourcePath, "utf8");
		const destinationPath = await this.reserveMarkdownPath(targetFolder, path.basename(sourcePath), log);
		const markdownWithImages = await this.syncImagesInMarkdown(
			sourceMarkdown,
			originalDir,
			destinationPath,
			log
		);
		const transformedMarkdown = await this.syncAttachmentsInMarkdown(
			markdownWithImages,
			originalDir,
			destinationPath,
			log
		);

		// Markdown content is always created through the Vault API, so Obsidian indexes it immediately.
		await this.app.vault.create(destinationPath, transformedMarkdown);
		log.importedMarkdown.push(destinationPath);
	}

	private async syncImagesInMarkdown(
		markdown: string,
		originalDir: string,
		destinationMarkdownPath: string,
		log: ImportLog
	): Promise<string> {
		const codeMaskedMarkdown = maskCodeSegments(markdown);
		const referenceDefinitions = collectReferenceDefinitions(markdown, codeMaskedMarkdown);
		const matches = Array.from(markdown.matchAll(IMAGE_SYNTAX_PATTERN)).filter(
			(match) => codeMaskedMarkdown[match.index ?? 0] !== " "
		);
		if (matches.length === 0) {
			return markdown;
		}

		const copiedAssets = new Map<string, string>();
		let output = "";
		let cursor = 0;
		const destinationDirectory = parentVaultPath(destinationMarkdownPath);
		const attachmentFolder = this.getAttachmentFolder(destinationMarkdownPath);
		let attachmentFolderPrepared = false;

		for (const match of matches) {
			const matchStart = match.index ?? 0;
			output += markdown.slice(cursor, matchStart);
			cursor = matchStart + match[0].length;

			const parsedImage = parseImageSyntax(match, referenceDefinitions);
			if (!parsedImage) {
				output += match[0];
				continue;
			}
			if (parsedImage.unresolvedReference) {
				const message = this.t().referenceDefinitionNotFound(parsedImage.unresolvedReference);
				log.missingAssets.push(`${destinationMarkdownPath} ← ${message}`);
				output += parsedImage.original;
				continue;
			}

			const altText = parsedImage.altText;
			const imageReference = parsedImage.imageReference;
			if (parsedImage.isWikiEmbed && !isImageReference(imageReference)) {
				output += parsedImage.original;
				continue;
			}
			if (isNonLocalReference(imageReference)) {
				log.skippedRemoteOrEmbedded += 1;
				output += parsedImage.original;
				continue;
			}

			const { fileReference: imageFileReference, suffix: imageSuffix } = splitReferenceSuffix(imageReference);
			const localImagePath = resolveExternalAssetPath(originalDir, imageFileReference);
			let assetVaultPath = copiedAssets.get(localImagePath);

			if (!assetVaultPath) {
				try {
					const imageStats = await fs.stat(localImagePath);
					if (!imageStats.isFile()) {
						throw new Error(this.t().pathIsNotFile);
					}

					const imageBytes = await fs.readFile(localImagePath);
					if (!attachmentFolderPrepared) {
						await this.ensureVaultFolder(attachmentFolder);
						attachmentFolderPrepared = true;
					}
					assetVaultPath = await this.copyAssetToVault(
						localImagePath,
						imageBytes,
						attachmentFolder,
						log
					);
					if (assetVaultPath) {
						copiedAssets.set(localImagePath, assetVaultPath);
					}
				} catch {
					log.missingAssets.push(
						`${destinationMarkdownPath} ← ${imageReference} (${this.t().assetNotFound})`
					);
				}
			}

			if (assetVaultPath) {
				const relativePath = makeVaultRelativePath(destinationDirectory, assetVaultPath);
				output += `![${escapeMarkdownAltText(altText)}](${escapeAttachmentMarkdownDestination(relativePath, imageSuffix)})`;
			} else if (this.settings.keepMissingAssetLinks) {
				output += parsedImage.original;
			}
		}

		output += markdown.slice(cursor);
		return output;
	}

	private async syncAttachmentsInMarkdown(
		markdown: string,
		originalDir: string,
		destinationMarkdownPath: string,
		log: ImportLog
	): Promise<string> {
		if (this.settings.attachmentSyncMode === "off") {
			return markdown;
		}

		const customExtensions = normalizeCustomExtensions(this.settings.customAttachmentExtensions);
		if (this.settings.attachmentSyncMode === "custom" && customExtensions.length === 0) {
			return markdown;
		}

		const codeMaskedMarkdown = maskCodeSegments(markdown);
		const referenceDefinitions = collectReferenceDefinitions(markdown, codeMaskedMarkdown);
		const matches = collectAttachmentMatches(markdown, codeMaskedMarkdown);
		if (matches.length === 0) {
			return markdown;
		}

		const copiedAssets = new Map<string, string>();
		let output = "";
		let cursor = 0;
		const destinationDirectory = parentVaultPath(destinationMarkdownPath);
		const attachmentFolder = this.getAttachmentFolder(destinationMarkdownPath);
		let attachmentFolderPrepared = false;

		for (const entry of matches) {
			const matchStart = entry.match.index ?? 0;
			output += markdown.slice(cursor, matchStart);
			cursor = matchStart + entry.match[0].length;

			const parsedAttachment = parseAttachmentSyntax(entry, referenceDefinitions);
			if (!parsedAttachment) {
				output += entry.match[0];
				continue;
			}
			if (parsedAttachment.unresolvedReference) {
				const message = this.t().referenceDefinitionNotFound(parsedAttachment.unresolvedReference);
				log.missingAssets.push(`${destinationMarkdownPath} ← ${message}`);
				output += parsedAttachment.original;
				continue;
			}

			if (isNonLocalReference(parsedAttachment.reference)) {
				output += parsedAttachment.original;
				continue;
			}

			const { fileReference, suffix } = splitReferenceSuffix(parsedAttachment.reference);
			const extension = getReferenceExtension(fileReference);
			if (
				!isAttachmentExtensionEnabled(
					extension,
					this.settings.attachmentSyncMode,
					customExtensions
				)
			) {
				output += parsedAttachment.original;
				continue;
			}

			const localAssetPath = resolveExternalAssetPath(originalDir, fileReference);
			let assetVaultPath = copiedAssets.get(localAssetPath);

			if (!assetVaultPath) {
				try {
					const assetStats = await fs.stat(localAssetPath);
					if (!assetStats.isFile()) {
						output += parsedAttachment.original;
						continue;
					}

					const assetBytes = await fs.readFile(localAssetPath);
					if (!attachmentFolderPrepared) {
						await this.ensureVaultFolder(attachmentFolder);
						attachmentFolderPrepared = true;
					}
					assetVaultPath = await this.copyAssetToVault(localAssetPath, assetBytes, attachmentFolder, log);
					if (assetVaultPath) {
						copiedAssets.set(localAssetPath, assetVaultPath);
					}
				} catch {
					log.missingAssets.push(
						`${destinationMarkdownPath} ← ${fileReference} (${this.t().assetNotFound})`
					);
				}
			}

			if (assetVaultPath) {
				const relativePath = makeVaultRelativePath(destinationDirectory, assetVaultPath);
				output += rewriteAttachmentSyntax(parsedAttachment, relativePath, suffix);
			} else if (this.settings.keepMissingAssetLinks) {
				output += parsedAttachment.original;
			}
		}

		output += markdown.slice(cursor);
		return output;
	}

	private async copyAssetToVault(
		localAssetPath: string,
		assetBytes: Uint8Array,
		attachmentFolder: string,
		log: ImportLog
	): Promise<string | undefined> {
		const originalName = path.basename(localAssetPath);
		const sourceHash = createHash("md5").update(assetBytes).digest("hex");
		let candidatePath = joinVaultPath(attachmentFolder, originalName);
		let existing = this.app.vault.getAbstractFileByPath(candidatePath);

		if (existing) {
			if (existing instanceof TFile && (await this.hasMatchingMd5(existing, sourceHash))) {
				log.reusedAssets.push(candidatePath);
				return candidatePath;
			}

			log.conflicts.push(candidatePath);
			if (this.settings.collisionStrategy === "skip") {
				return undefined;
			}

			if (this.settings.collisionStrategy === "overwrite") {
				if (!(existing instanceof TFile)) {
					throw new Error(this.t().cannotOverwriteFolder(candidatePath));
				}
				// Existing binary attachments must be updated through Vault as well.
				await this.app.vault.modifyBinary(existing, bufferToArrayBuffer(assetBytes));
				return candidatePath;
			}

			const resolvedAsset = await this.findMd5SuffixedAssetPath(attachmentFolder, originalName, sourceHash);
			candidatePath = resolvedAsset.path;
			if (resolvedAsset.reused) {
				log.reusedAssets.push(candidatePath);
				return candidatePath;
			}
		}

		// createBinary is the Vault API equivalent of create for binary files.
		await this.app.vault.createBinary(candidatePath, bufferToArrayBuffer(assetBytes));
		return candidatePath;
	}

	private async findMd5SuffixedAssetPath(
		folder: string,
		originalName: string,
		md5: string
	): Promise<{ path: string; reused: boolean }> {
		const extension = path.extname(originalName);
		const baseName = extension ? originalName.slice(0, -extension.length) : originalName;
		let suffix = `-${md5}`;
		let candidate = joinVaultPath(folder, `${baseName}${suffix}${extension}`);
		let counter = 2;

		let existing = this.app.vault.getAbstractFileByPath(candidate);
		while (existing) {
			if (existing instanceof TFile && (await this.hasMatchingMd5(existing, md5))) {
				return { path: candidate, reused: true };
			}
			suffix = `-${md5}-${counter}`;
			candidate = joinVaultPath(folder, `${baseName}${suffix}${extension}`);
			counter += 1;
			existing = this.app.vault.getAbstractFileByPath(candidate);
		}

		return { path: candidate, reused: false };
	}

	private async hasMatchingMd5(existingFile: TFile, expectedHash: string): Promise<boolean> {
		try {
			const existingBytes = await this.app.vault.readBinary(existingFile);
			const existingHash = createHash("md5").update(new Uint8Array(existingBytes)).digest("hex");
			return existingHash === expectedHash;
		} catch {
			return false;
		}
	}

	private getAttachmentFolder(destinationMarkdownPath: string): string {
		const markdownFolder = parentVaultPath(destinationMarkdownPath);
		const configuredPath = this.readNativeAttachmentFolderPath();

		if (configuredPath === null) {
			// The documented fallback keeps attachments beside each imported Markdown file.
			return joinVaultPath(markdownFolder, "assets");
		}

		const configured = configuredPath.replace(/\\/g, "/").trim();
		if (configured === "." || configured === "./") {
			return markdownFolder;
		}
		if (configured.startsWith("./")) {
			return joinVaultPath(markdownFolder, configured.slice(2));
		}
		if (configured.startsWith("/") || configured.split("/").includes("..")) {
			return joinVaultPath(markdownFolder, "assets");
		}

		// Empty configuration means the Vault root in Obsidian's native setting.
		return configured ? normalizePath(configured) : "";
	}

	private readNativeAttachmentFolderPath(): string | null {
		try {
			const configurableVault = this.app.vault as typeof this.app.vault & {
				getConfig?: (key: string) => unknown;
			};
			const value = configurableVault.getConfig?.("attachmentFolderPath");
			return typeof value === "string" ? value : null;
		} catch {
			return null;
		}
	}

	private async ensureVaultFolder(folderPath: string): Promise<void> {
		if (!folderPath) {
			return;
		}

		const segments = folderPath.split("/");
		let current = "";
		for (const segment of segments) {
			current = joinVaultPath(current, segment);
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (!existing) {
				await this.app.vault.createFolder(current);
			} else if (!(existing instanceof TFolder)) {
				throw new Error(this.t().attachmentPathOccupied(current));
			}
		}
	}

	private async reserveMarkdownPath(targetFolder: string, sourceFileName: string, log: ImportLog): Promise<string> {
		let candidate = joinVaultPath(targetFolder, sourceFileName);
		if (!this.app.vault.getAbstractFileByPath(candidate)) {
			return candidate;
		}

		const extension = path.extname(sourceFileName) || ".md";
		const baseName = sourceFileName.slice(0, -extension.length);
		let counter = 2;
		while (this.app.vault.getAbstractFileByPath(candidate)) {
			candidate = joinVaultPath(targetFolder, `${baseName}-import-${counter}${extension}`);
			counter += 1;
		}
		log.conflicts.push(joinVaultPath(targetFolder, sourceFileName));
		return candidate;
	}

	private reportImportResult(log: ImportLog): void {
		const strings = this.t();
		new Notice(
			strings.resultNotice(log.importedMarkdown.length, log.errors.length, log.missingAssets.length, log.conflicts.length),
			8000
		);
		new ImportReportModal(this.app, strings, log).open();
	}
}

class ImportReportModal extends Modal {
	constructor(
		app: App,
		private readonly strings: Translation,
		private readonly log: ImportLog
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.createEl("h2", { text: this.strings.reportHeading });
		this.addEntries(this.strings.reportImported, this.log.importedMarkdown);
		this.addEntries(this.strings.reportReused, this.log.reusedAssets);
		this.contentEl.createEl("p", {
			text: `${this.strings.reportSkipped} ${this.log.skippedRemoteOrEmbedded}`
		});
		this.addEntries(this.strings.reportMissing, this.log.missingAssets);
		this.addEntries(this.strings.reportConflicts, this.log.conflicts);
		this.addEntries(this.strings.reportErrors, this.log.errors);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private addEntries(heading: string, entries: string[]): void {
		if (entries.length === 0) return;
		this.contentEl.createEl("h3", { text: heading });
		const list = this.contentEl.createEl("ul");
		for (const entry of entries) {
			list.createEl("li", { text: entry });
		}
	}
}

class MdAssetSyncSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: MdAssetSyncPlugin) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const strings = this.plugin.t();
		return [
			{
				name: strings.importUsageName,
				desc: strings.importUsageDesc
			},
			{
				name: strings.languageName,
				desc: strings.languageDesc,
				control: {
					type: "dropdown",
					key: "language",
					defaultValue: DEFAULT_SETTINGS.language,
					options: {
						en: strings.languageEnglish,
						"zh-CN": strings.languageChinese
					}
				}
			},
			{
				name: strings.attachmentModeName,
				desc: strings.attachmentModeDesc,
				control: {
					type: "dropdown",
					key: "attachmentSyncMode",
					defaultValue: DEFAULT_SETTINGS.attachmentSyncMode,
					options: {
						off: strings.attachmentModeOff,
						office: strings.attachmentModeOffice,
						all: strings.attachmentModeAll,
						custom: strings.attachmentModeCustom
					}
				}
			},
			{
				name: strings.customExtensionsName,
				desc: strings.customExtensionsDesc,
				visible: () => this.plugin.settings.attachmentSyncMode === "custom",
				control: {
					type: "text",
					key: "customAttachmentExtensions",
					defaultValue: DEFAULT_SETTINGS.customAttachmentExtensions,
					placeholder: strings.customExtensionsPlaceholder
				}
			},
			{
				name: strings.collisionName,
				desc: strings.collisionDesc,
				control: {
					type: "dropdown",
					key: "collisionStrategy",
					defaultValue: DEFAULT_SETTINGS.collisionStrategy,
					options: {
						"append-md5": strings.collisionAppend,
						overwrite: strings.collisionOverwrite,
						skip: strings.collisionSkip
					}
				}
			},
			{
				name: strings.linkFormatName,
				desc: strings.linkFormatDesc,
				render: (setting) => {
					setting.addText((text) => text.setValue(strings.linkFormatValue).setDisabled(true));
				}
			},
			{
				name: strings.keepMissingName,
				desc: strings.keepMissingDesc,
				control: {
					type: "toggle",
					key: "keepMissingAssetLinks",
					defaultValue: DEFAULT_SETTINGS.keepMissingAssetLinks
				}
			}
		];
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof MdAssetSyncSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		let updateDefinitions = false;
		switch (key) {
			case "language":
				if (typeof value !== "string" || !Object.hasOwn(TRANSLATIONS, value)) return;
				this.plugin.settings.language = value as PluginLanguage;
				this.plugin.refreshInterfaceLabels();
				updateDefinitions = true;
				break;
			case "attachmentSyncMode":
				if (
					typeof value !== "string" ||
					!ATTACHMENT_SYNC_MODES.includes(value as AttachmentSyncMode)
				) {
					return;
				}
				this.plugin.settings.attachmentSyncMode = value as AttachmentSyncMode;
				updateDefinitions = true;
				break;
			case "customAttachmentExtensions":
				if (typeof value !== "string") return;
				this.plugin.settings.customAttachmentExtensions = normalizeCustomExtensions(value).join(", ");
				break;
			case "collisionStrategy":
				if (typeof value !== "string" || !COLLISION_STRATEGIES.includes(value as CollisionStrategy)) {
					return;
				}
				this.plugin.settings.collisionStrategy = value as CollisionStrategy;
				break;
			case "keepMissingAssetLinks":
				if (typeof value !== "boolean") return;
				this.plugin.settings.keepMissingAssetLinks = value;
				break;
			default:
				return;
		}

		await this.plugin.saveSettings();
		if (updateDefinitions) {
			this.update();
		}
	}
}

class VaultFolderPickerModal extends Modal {
	private completed = false;
	private selectedPath = "";

	constructor(
		app: App,
		private readonly strings: Translation,
		private readonly onSelect: (folderPath: string | null) => void
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.createEl("h2", { text: this.strings.folderModalHeading });
		this.contentEl.createEl("p", {
			text: this.strings.folderModalDesc
		});
		const folders = this.app.vault
			.getAllFolders()
			.map((folder) => folder.path)
			.filter((folderPath) => folderPath.length > 0)
			.sort((left, right) => left.localeCompare(right, "zh-CN"));

		new Setting(this.contentEl)
			.setName(this.strings.markdownFolderName)
			.setDesc(this.strings.markdownFolderDesc)
			.addDropdown((dropdown) => {
				dropdown.addOption("", this.strings.vaultRoot);
				for (const folderPath of folders) {
					dropdown.addOption(folderPath, folderPath);
				}
				dropdown.setValue(this.selectedPath).onChange((value) => {
					this.selectedPath = value;
				});
			});

		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(this.strings.cancel).onClick(() => this.finish(null)))
			.addButton((button) =>
				button.setButtonText(this.strings.importHere).setCta().onClick(() => this.finish(this.selectedPath))
			);
	}

	onClose(): void {
		if (!this.completed) {
			this.finish(null);
		}
		this.contentEl.empty();
	}

	private finish(folderPath: string | null): void {
		if (this.completed) return;
		this.completed = true;
		this.onSelect(folderPath);
		this.close();
	}
}

type ImportSourceKind = "files" | "folder";

class ImportSourcePickerModal extends Modal {
	private completed = false;

	constructor(
		app: App,
		private readonly strings: Translation,
		private readonly onSelect: (sourceKind: ImportSourceKind | null) => void
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.createEl("h2", { text: this.strings.sourcePickerHeading });
		this.contentEl.createEl("p", { text: this.strings.sourcePickerDesc });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(this.strings.cancel).onClick(() => this.finish(null)))
			.addButton((button) => button.setButtonText(this.strings.chooseFiles).onClick(() => this.finish("files")))
			.addButton((button) =>
				button.setButtonText(this.strings.chooseFolder).setCta().onClick(() => this.finish("folder"))
			);
	}

	onClose(): void {
		if (!this.completed) this.finish(null);
		this.contentEl.empty();
	}

	private finish(sourceKind: ImportSourceKind | null): void {
		if (this.completed) return;
		this.completed = true;
		this.onSelect(sourceKind);
		this.close();
	}
}

async function chooseMarkdownFiles(app: App, strings: Translation): Promise<string[]> {
	const sourceKind = await chooseImportSourceKind(app, strings);
	if (!sourceKind) return [];

	const dialog = getElectronDialog();
	if (dialog) {
		const result = await dialog.showOpenDialog({
			properties: [sourceKind === "files" ? "openFile" : "openDirectory", "multiSelections"],
			filters: sourceKind === "files" ? [{ name: strings.markdownFilter, extensions: ["md", "markdown"] }] : undefined
		});
		return result.canceled ? [] : collectMarkdownFiles(result.filePaths);
	}

	// Obsidian desktop normally exposes Electron's dialog. This keeps the command usable
	// if a future version removes that bridge while still using the OS file chooser.
	return collectMarkdownFiles(await chooseMarkdownFilesWithInput(sourceKind));
}

function getElectronDialog(): ElectronDialog | null {
	try {
		const requireFromWindow = (window as Window & { require?: (moduleName: string) => unknown }).require;
		if (!requireFromWindow) return null;

		const electron = requireFromWindow("electron") as { remote?: { dialog?: ElectronDialog } };
		if (electron.remote?.dialog) return electron.remote.dialog;

		const remote = requireFromWindow("@electron/remote") as { dialog?: ElectronDialog };
		return remote.dialog ?? null;
	} catch {
		return null;
	}
}

function chooseImportSourceKind(app: App, strings: Translation): Promise<ImportSourceKind | null> {
	return new Promise((resolve) => new ImportSourcePickerModal(app, strings, resolve).open());
}

function chooseMarkdownFilesWithInput(sourceKind: ImportSourceKind): Promise<string[]> {
	return new Promise((resolve) => {
		const input = document.body.createEl("input");
		input.type = "file";
		if (sourceKind === "files") {
			input.accept = ".md,.markdown,text/markdown";
		} else {
			input.setAttr("webkitdirectory", "");
		}
		input.multiple = true;
		input.setCssStyles({ display: "none" });

		input.addEventListener(
			"change",
			() => {
				const filePaths = Array.from(input.files ?? [])
					.map((file) => (file as File & { path?: string }).path)
					.filter((filePath): filePath is string => Boolean(filePath));
				input.remove();
				resolve(filePaths);
			},
			{ once: true }
		);
		input.addEventListener(
			"cancel",
			() => {
				input.remove();
				resolve([]);
			},
			{ once: true }
		);

		input.click();
	});
}

async function collectMarkdownFiles(sourcePaths: string[]): Promise<string[]> {
	const markdownPaths = new Set<string>();

	for (const sourcePath of sourcePaths) {
		const sourceStat = (await fs.stat(sourcePath)) as { isFile(): boolean; isDirectory(): boolean };
		if (sourceStat.isFile()) {
			if (isMarkdownFilePath(sourcePath)) markdownPaths.add(path.normalize(sourcePath));
			continue;
		}
		if (sourceStat.isDirectory()) await collectMarkdownFilesFromDirectory(sourcePath, markdownPaths);
	}

	return Array.from(markdownPaths);
}

async function collectMarkdownFilesFromDirectory(directoryPath: string, markdownPaths: Set<string>): Promise<void> {
	const entries = await (
		fs as unknown as {
			readdir(path: string, options: { withFileTypes: true }): Promise<Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>>;
		}
	).readdir(directoryPath, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

		const entryPath = path.resolve(directoryPath, entry.name);
		if (entry.isDirectory()) {
			await collectMarkdownFilesFromDirectory(entryPath, markdownPaths);
		} else if (entry.isFile() && isMarkdownFilePath(entryPath)) {
			markdownPaths.add(path.normalize(entryPath));
		}
	}
}

function isMarkdownFilePath(filePath: string): boolean {
	const extension = path.extname(filePath).toLowerCase();
	return extension === ".md" || extension === ".markdown";
}

function chooseVaultFolder(app: App, strings: Translation): Promise<string | null> {
	return new Promise((resolve) => {
		new VaultFolderPickerModal(app, strings, resolve).open();
	});
}

function collectReferenceDefinitions(markdown: string, codeMaskedMarkdown: string): Map<string, string> {
	const definitions = new Map<string, string>();
	for (const match of markdown.matchAll(REFERENCE_DEFINITION_PATTERN)) {
		if (codeMaskedMarkdown[match.index ?? 0] === " ") {
			continue;
		}
		const label = normalizeReferenceLabel(match[1]);
		if (!definitions.has(label)) {
			definitions.set(label, removeAngleBrackets(match[2] ?? match[3] ?? ""));
		}
	}
	return definitions;
}

function maskCodeSegments(markdown: string): string {
	const ranges: Array<[number, number]> = [];
	const fencedCodePattern = /^ {0,3}(`{3,}|~{3,})[^\r\n]*(?:\r?\n|\r|$)[\s\S]*?^ {0,3}\1[ \t]*(?=\r?$)/gm;
	for (const match of markdown.matchAll(fencedCodePattern)) {
		ranges.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
	}

	let maskedMarkdown = maskCodeRanges(markdown, ranges);
	const inlineCodePattern = /(`+)([\s\S]*?)\1/g;
	for (const match of maskedMarkdown.matchAll(inlineCodePattern)) {
		ranges.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
	}
	maskedMarkdown = maskCodeRanges(markdown, ranges);
	return maskedMarkdown;
}

function maskCodeRanges(markdown: string, ranges: Array<[number, number]>): string {
	let masked = markdown;
	for (const [start, end] of [...ranges].sort((left, right) => right[0] - left[0])) {
		const replacement = masked.slice(start, end).replace(/[^\r\n]/g, " ");
		masked = masked.slice(0, start) + replacement + masked.slice(end);
	}
	return masked;
}

function parseImageSyntax(match: RegExpMatchArray, definitions: Map<string, string>): ParsedImageSyntax | null {
	const original = match[0];

	if (match[1] !== undefined && match[2] !== undefined) {
		return {
			altText: match[1],
			imageReference: removeAngleBrackets(match[2]),
			original
		};
	}

	if (match[3] !== undefined) {
		const altText = match[3];
		const label = match[4]?.trim() || altText;
		const imageReference = definitions.get(normalizeReferenceLabel(label));
		return imageReference
			? { altText, imageReference, original }
			: { altText, imageReference: "", original, unresolvedReference: label };
	}

	if (match[5] !== undefined) {
		const [rawTarget, ...aliasParts] = match[5].split("|");
		const imageReference = rawTarget.trim();
		const altText = aliasParts.join("|").trim() || path.basename(imageReference, path.extname(imageReference));
		return { altText, imageReference, original, isWikiEmbed: true };
	}

	if (match[6] !== undefined) {
		const altText = match[6];
		const imageReference = definitions.get(normalizeReferenceLabel(altText));
		return imageReference ? { altText, imageReference, original } : null;
	}

	if (match[7] !== undefined || match[8] !== undefined) {
		const imageReference = decodeHtmlEntities(match[7] ?? match[8] ?? "").trim();
		const altText =
			extractHtmlAttribute(original, "alt") || path.basename(imageReference, path.extname(imageReference));
		return { altText, imageReference, original };
	}

	return null;
}

function collectAttachmentMatches(markdown: string, codeMaskedMarkdown: string): AttachmentMatch[] {
	const patterns: Array<[AttachmentSyntaxKind, RegExp]> = [
		["markdown-inline", ATTACHMENT_INLINE_PATTERN],
		["markdown-reference", ATTACHMENT_REFERENCE_PATTERN],
		["wiki-link", WIKI_LINK_PATTERN],
		["wiki-embed", WIKI_EMBED_PATTERN],
		["html-link", HTML_ATTACHMENT_PATTERN]
	];
	const candidates: AttachmentMatch[] = [];

	for (const [kind, pattern] of patterns) {
		for (const match of markdown.matchAll(pattern)) {
			const start = match.index ?? 0;
			if (codeMaskedMarkdown[start] !== " ") {
				candidates.push({ kind, match });
			}
		}
	}

	candidates.sort((left, right) => {
		const startDifference = (left.match.index ?? 0) - (right.match.index ?? 0);
		return startDifference || right.match[0].length - left.match[0].length;
	});

	const matches: AttachmentMatch[] = [];
	let consumedUntil = 0;
	for (const candidate of candidates) {
		const start = candidate.match.index ?? 0;
		if (start < consumedUntil) {
			continue;
		}
		matches.push(candidate);
		consumedUntil = start + candidate.match[0].length;
	}
	return matches;
}

function parseAttachmentSyntax(
	entry: AttachmentMatch,
	definitions: Map<string, string>
): ParsedAttachmentSyntax | null {
	const original = entry.match[0];
	switch (entry.kind) {
		case "markdown-inline":
			return {
				kind: entry.kind,
				label: entry.match[1],
				original,
				reference: removeAngleBrackets(entry.match[2])
			};
		case "markdown-reference": {
			const label = entry.match[1];
			const referenceLabel = entry.match[2]?.trim() || label;
			const reference = definitions.get(normalizeReferenceLabel(referenceLabel));
			return reference
				? { kind: entry.kind, label, original, reference }
				: { kind: entry.kind, label, original, reference: "", unresolvedReference: referenceLabel };
		}
		case "wiki-link":
		case "wiki-embed": {
			const [rawTarget, ...aliasParts] = entry.match[1].split("|");
			return {
				alias: aliasParts.join("|").trim() || undefined,
				kind: entry.kind,
				label: "",
				original,
				reference: rawTarget.trim()
			};
		}
		case "html-link":
			return {
				kind: entry.kind,
				label: "",
				original,
				reference: decodeHtmlEntities(entry.match[1] ?? entry.match[2] ?? "").trim()
			};
	}
}

function normalizeCustomExtensions(value: string): string[] {
	return Array.from(
		new Set(
			value
				.split(/[,\uFF0C;\s]+/)
				.map((extension) => extension.trim().replace(/^\.+/, "").toLowerCase())
				.filter((extension) => extension.length > 0 && !/[\\/.*?]/.test(extension))
		)
	).sort((left, right) => left.localeCompare(right));
}

function splitReferenceSuffix(reference: string): { fileReference: string; suffix: string } {
	const suffixIndex = reference.search(/[?#]/);
	return suffixIndex === -1
		? { fileReference: reference, suffix: "" }
		: { fileReference: reference.slice(0, suffixIndex), suffix: reference.slice(suffixIndex) };
}

function getReferenceExtension(reference: string): string {
	const unescapedReference = unescapeMarkdownText(reference.trim());
	let pathReference = removeAngleBrackets(unescapedReference);
	if (/^file:/i.test(pathReference)) {
		try {
			pathReference = fileURLToPath(pathReference);
		} catch {
			return "";
		}
	}

	const decodedReference = safelyDecodeUriComponent(pathReference).replace(/\\/g, "/");
	const fileName = decodedReference.split("/").at(-1) ?? "";
	const extensionIndex = fileName.lastIndexOf(".");
	return extensionIndex > 0 ? fileName.slice(extensionIndex + 1).toLowerCase() : "";
}

function isImageReference(reference: string): boolean {
	return IMAGE_EXTENSIONS.has(getReferenceExtension(splitReferenceSuffix(reference).fileReference));
}

function isAttachmentExtensionEnabled(
	extension: string,
	mode: AttachmentSyncMode,
	customExtensions: string[]
): boolean {
	if (EXCLUDED_ATTACHMENT_EXTENSIONS.has(extension) || IMAGE_EXTENSIONS.has(extension)) {
		return false;
	}
	if (mode === "office") {
		return OFFICE_ATTACHMENT_EXTENSIONS.has(extension);
	}
	if (mode === "custom") {
		return customExtensions.includes(extension);
	}
	return mode === "all";
}

function rewriteAttachmentSyntax(
	attachment: ParsedAttachmentSyntax,
	relativePath: string,
	suffix: string
): string {
	switch (attachment.kind) {
		case "markdown-inline":
		case "markdown-reference":
			return `[${escapeMarkdownAltText(attachment.label)}](${escapeAttachmentMarkdownDestination(relativePath, suffix)})`;
		case "wiki-link": {
			const alias = attachment.alias ? `|${attachment.alias}` : "";
			return `[[${relativePath}${suffix}${alias}]]`;
		}
		case "wiki-embed": {
			const alias = attachment.alias ? `|${attachment.alias}` : "";
			return `![[${relativePath}${suffix}${alias}]]`;
		}
		case "html-link":
			return replaceHtmlHref(attachment.original, escapeHtmlAttribute(relativePath, suffix));
	}
}

function escapeAttachmentMarkdownDestination(relativePath: string, suffix: string): string {
	return escapeMarkdownDestination(relativePath) + suffix.replace(/ /g, "%20");
}

function replaceHtmlHref(original: string, destination: string): string {
	return original.replace(
		/(\bhref\s*=\s*)(["'])(.*?)\2/i,
		(_match, prefix: string, quote: string) => `${prefix}${quote}${destination}${quote}`
	);
}

function escapeHtmlAttribute(relativePath: string, suffix: string): string {
	return `${escapeMarkdownDestination(relativePath)}${suffix}`
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function normalizeReferenceLabel(label: string): string {
	return unescapeMarkdownText(label).trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase();
}

function isNonLocalReference(imagePath: string): boolean {
	const reference = imagePath.trim();
	return /^(https?:\/\/|data:)/i.test(reference) || (/^[a-z][a-z0-9+.-]+:/i.test(reference) && !/^file:/i.test(reference));
}

function resolveExternalAssetPath(originalDir: string, assetReference: string): string {
	const unescapedReference = unescapeMarkdownText(assetReference.trim());
	if (/^file:/i.test(unescapedReference)) {
		return path.normalize(fileURLToPath(unescapedReference));
	}

	const decodedReference = safelyDecodeUriComponent(unescapedReference);
	const platformPath = path.sep === "\\" ? decodedReference.replace(/\//g, "\\") : decodedReference.replace(/\\/g, "/");
	return path.isAbsolute(platformPath) || /^[A-Za-z]:[\\/]/.test(decodedReference) || /^\\\\/.test(decodedReference)
		? path.normalize(platformPath)
		: path.resolve(originalDir, platformPath);
}

function safelyDecodeUriComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function removeAngleBrackets(value: string): string {
	const trimmed = value.trim();
	return trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed.slice(1, -1) : trimmed;
}

function unescapeMarkdownText(value: string): string {
	const escapable = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
	return value.replace(/\\(.)/g, (match, character: string) => (escapable.includes(character) ? character : match));
}

function extractHtmlAttribute(tag: string, attributeName: string): string {
	const pattern = new RegExp(`\\b${attributeName}\\s*=\\s*(["'])(.*?)\\1`, "i");
	return decodeHtmlEntities(tag.match(pattern)?.[2] ?? "");
}

function decodeHtmlEntities(value: string): string {
	const namedEntities: Record<string, string> = {
		amp: "&",
		apos: "'",
		gt: ">",
		lt: "<",
		quot: "\""
	};

	return value
		.replace(/&([a-z]+);/gi, (match, name: string) => namedEntities[name.toLowerCase()] ?? match)
		.replace(/&#(\d+);/g, (match, code: string) => {
			const valuePoint = Number.parseInt(code, 10);
			return Number.isFinite(valuePoint) ? String.fromCodePoint(valuePoint) : match;
		})
		.replace(/&#x([0-9a-f]+);/gi, (match, code: string) => {
			const valuePoint = Number.parseInt(code, 16);
			return Number.isFinite(valuePoint) ? String.fromCodePoint(valuePoint) : match;
		});
}

function parentVaultPath(vaultPath: string): string {
	const separatorIndex = vaultPath.lastIndexOf("/");
	return separatorIndex === -1 ? "" : vaultPath.slice(0, separatorIndex);
}

function joinVaultPath(...segments: string[]): string {
	const joined = segments.filter(Boolean).join("/");
	return joined ? normalizePath(joined) : "";
}

function makeVaultRelativePath(fromFolder: string, toPath: string): string {
	const relative = path.posix.relative(fromFolder || ".", toPath);
	return relative || path.posix.basename(toPath);
}

function escapeMarkdownDestination(value: string): string {
	return value.replace(/ /g, "%20").replace(/#/g, "%23").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function escapeMarkdownAltText(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/\x5d/g, "\\]");
}

function bufferToArrayBuffer(buffer: Uint8Array): ArrayBuffer {
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}
