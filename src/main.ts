import {
	App,
	Modal,
	Notice,
	Platform,
	Plugin,
	PluginSettingTab,
	Setting,
	setTooltip,
	TFile,
	TFolder,
	normalizePath
} from "obsidian";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

type CollisionStrategy = "append-md5" | "overwrite" | "skip";
type PluginLanguage = "en" | "zh-CN";

interface MdAssetSyncSettings {
	language: PluginLanguage;
	collisionStrategy: CollisionStrategy;
	keepMissingImageLinks: boolean;
}

interface ImportLog {
	importedMarkdown: string[];
	reusedAssets: string[];
	missingImages: string[];
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
	unresolvedReference?: string;
}

const TRANSLATIONS = {
	en: {
		commandName: "Import external Markdown and sync images",
		desktopOnly: "MdAssetSync is available on Obsidian desktop only.",
		importInProgress: "MdAssetSync: an import is already running. Wait for it to finish.",
		progressPreparing: (target: string) => `MdAssetSync: preparing to import Markdown to ${target}…`,
		progressImporting: (current: number, total: number, fileName: string) =>
			`MdAssetSync: importing ${current}/${total}: ${fileName}`,
		cannotStartImport: "MdAssetSync: unable to start the import. See the developer console for details.",
		pathIsNotFile: "The path is not a file.",
		referenceDefinitionNotFound: (label: string) => `Image reference definition not found: ${label}`,
		imageNotFound: "Image not found",
		reusedSameName: "Same file name and content, reusing the existing image",
		skippedSameName: "Different file with the same name was skipped",
		cannotOverwriteFolder: (folderPath: string) => `Cannot overwrite a folder with the same name: ${folderPath}`,
		overwrittenSameName: "Different file with the same name was overwritten",
		reusedMd5Conflict: "Reused a conflicting image with the same MD5",
		conflictAppended: "Image conflict: an MD5 suffix was added",
		hashCompareFailed: "Could not compare the existing file; treating it as a conflict",
		unsafeAttachmentFolder: "Ignoring an unsafe Obsidian attachment folder setting",
		attachmentConfigReadFailed: "Could not read the Obsidian attachment setting; using the assets fallback",
		attachmentPathOccupied: (folderPath: string) => `Attachment folder path is occupied by a file: ${folderPath}`,
		markdownRenamed: "A Markdown file with the same name was renamed for import",
		importFailed: "Failed to import Markdown",
		reportHeading: "Import results",
		reportImported: "Imported Markdown:",
		reportReused: "Reused images:",
		reportSkipped: "Skipped remote or embedded images:",
		reportMissing: "Missing images:",
		reportConflicts: "File conflicts:",
		reportErrors: "Import errors:",
		resultNotice: (imported: number, failed: number, missing: number, conflicts: number) =>
			`MdAssetSync: ${imported} imported; ${failed} failed; ${missing} missing images; ${conflicts} conflicts. See the developer console for details.`,
		settingsHeading: "MdAssetSync settings",
		languageName: "Plugin language",
		languageDesc: "Choose the language used by commands, settings, dialogs, and notifications.",
		languageEnglish: "English",
		languageChinese: "简体中文",
		collisionName: "Same-name file strategy",
		collisionDesc: "Same-name images are checked by MD5 first. Matching content is reused; different content follows this strategy.",
		collisionAppend: "Reuse matches; append MD5 when different",
		collisionOverwrite: "Reuse matches; overwrite when different",
		collisionSkip: "Reuse matches; warn and skip when different",
		linkFormatName: "Output link format",
		linkFormatDesc: "Output is fixed to standard Markdown image links ![](); this plugin does not generate wiki links.",
		linkFormatValue: "Standard Markdown ![]()",
		keepMissingName: "Keep original links for missing images",
		keepMissingDesc: "When disabled, missing local image links are removed from the imported Markdown. Remote and base64 images are always kept.",
		folderModalHeading: "Choose the Markdown import location",
		folderModalDesc: "This choice controls only where Markdown files are written. Images follow the attachment location configured in Obsidian Settings → Files and links.",
		markdownFolderName: "Markdown destination folder",
		markdownFolderDesc: "Defaults to the vault root. This is independent of the attachment folder and does not affect image placement.",
		vaultRoot: "Vault root",
		cancel: "Cancel",
		importHere: "Import here",
		markdownFilter: "Markdown"
	},
	"zh-CN": {
		commandName: "导入外部Markdown并同步图片资源",
		desktopOnly: "MdAssetSync 仅支持 Obsidian 桌面端。",
		importInProgress: "MdAssetSync：已有导入任务正在进行，请等待完成。",
		progressPreparing: (target: string) => `MdAssetSync：将 Markdown 导入到 ${target}，正在准备…`,
		progressImporting: (current: number, total: number, fileName: string) =>
			`MdAssetSync：正在导入 ${current}/${total}：${fileName}`,
		cannotStartImport: "MdAssetSync：无法启动导入。详情见开发者控制台。",
		pathIsNotFile: "路径不是文件",
		referenceDefinitionNotFound: (label: string) => `找不到图片引用定义：${label}`,
		imageNotFound: "找不到图片",
		reusedSameName: "同名且内容相同，复用已有图片",
		skippedSameName: "同名图片内容不同，已跳过",
		cannotOverwriteFolder: (folderPath: string) => `无法覆盖同名文件夹：${folderPath}`,
		overwrittenSameName: "同名图片内容不同，已覆盖",
		reusedMd5Conflict: "已复用相同 MD5 的冲突图片",
		conflictAppended: "同名图片冲突，已追加 MD5 后缀",
		hashCompareFailed: "无法比较同名文件内容，将按冲突处理",
		unsafeAttachmentFolder: "忽略不安全的 Obsidian 附件目录配置",
		attachmentConfigReadFailed: "无法读取 Obsidian 附件设置，将使用 assets 兜底目录",
		attachmentPathOccupied: (folderPath: string) => `附件目录路径被文件占用：${folderPath}`,
		markdownRenamed: "同名 Markdown 已改名导入",
		importFailed: "导入 Markdown 失败",
		reportHeading: "导入结果",
		reportImported: "成功导入 Markdown：",
		reportReused: "复用已有图片：",
		reportSkipped: "跳过网络或内嵌图片：",
		reportMissing: "找不到的图片：",
		reportConflicts: "冲突文件：",
		reportErrors: "导入失败：",
		resultNotice: (imported: number, failed: number, missing: number, conflicts: number) =>
			`MdAssetSync：成功 ${imported} 个；失败 ${failed} 个；找不到图片 ${missing} 个；冲突 ${conflicts} 个。详情见开发者控制台。`,
		settingsHeading: "MdAssetSync 设置",
		languageName: "插件语言",
		languageDesc: "选择命令、设置、弹窗和通知所使用的语言。",
		languageEnglish: "English",
		languageChinese: "简体中文",
		collisionName: "同名文件策略",
		collisionDesc: "同名图片会先比较 MD5：内容一致时直接复用；内容不一致时按下列策略处理。",
		collisionAppend: "相同复用；不同追加 MD5 后缀",
		collisionOverwrite: "相同复用；不同直接覆盖",
		collisionSkip: "相同复用；不同跳过并警告",
		linkFormatName: "输出链接格式",
		linkFormatDesc: "固定为标准 Markdown 图片链接 ![]()；本插件不生成 Wiki 链接。",
		linkFormatValue: "标准 Markdown ![]()",
		keepMissingName: "保留找不到图片的原始链接",
		keepMissingDesc: "关闭后，找不到的本地图片会从 Markdown 正文移除；网络和 base64 图片始终保留。",
		folderModalHeading: "选择 Markdown 导入位置",
		folderModalDesc: "此选择只决定 Markdown 文件的位置。图片会单独遵循 Obsidian“设置 → 文件与链接”中的附件默认存放位置。",
		markdownFolderName: "Markdown 目标文件夹",
		markdownFolderDesc: "默认 Vault 根目录。这里独立于附件目录，图片不会依据此选项决定存放位置。",
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
	keepMissingImageLinks: true
};

// Supports inline Markdown images, reference-style images, and Obsidian embeds.
const IMAGE_SYNTAX_PATTERN =
	/!\[([^\]\n]*)\]\(\s*(<[^>\n]+>|(?:\\.|[^\s)])+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)|!\[([^\]\n]*)\]\[([^\]\n]*)\]|!\[\[([^\]\n]+)\]\]|!\[([^\]\n]+)\](?![\[(])|<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi;
const REFERENCE_DEFINITION_PATTERN =
	/^ {0,3}\[([^\]\n]+)\]:[ \t]*(?:<([^>\n]+)>|(\S+))(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*\r?$/gm;

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
		const savedSettings = (await this.loadData()) as Partial<MdAssetSyncSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
		if (!Object.hasOwn(TRANSLATIONS, this.settings.language)) {
			this.settings.language = DEFAULT_SETTINGS.language;
		}
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
			const sourcePaths = Array.from(
				new Set((await chooseMarkdownFiles(this.t().markdownFilter)).map((sourcePath) => path.normalize(sourcePath)))
			);
			if (sourcePaths.length === 0) {
				return;
			}

			const targetFolder = await chooseVaultFolder(this.app, this.t());
			if (targetFolder === null) {
				return;
			}
			const targetFolderLabel = targetFolder || this.t().vaultRoot;
			const log: ImportLog = {
				importedMarkdown: [],
				reusedAssets: [],
				missingImages: [],
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
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					log.errors.push(`${sourcePath}：${message}`);
					console.error(`[MdAssetSync] ${this.t().importFailed}`, sourcePath, error);
				}
			}

			this.reportImportResult(log);
		} catch (error) {
			console.error(`[MdAssetSync] ${this.t().cannotStartImport}`, error);
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
		const transformedMarkdown = await this.syncImagesInMarkdown(
			sourceMarkdown,
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
				log.missingImages.push(`${destinationMarkdownPath} ← ${message}`);
				console.warn(`[MdAssetSync] ${message}`);
				output += parsedImage.original;
				continue;
			}

			const altText = parsedImage.altText;
			const imageReference = parsedImage.imageReference;
			if (isRemoteOrEmbeddedImage(imageReference)) {
				log.skippedRemoteOrEmbedded += 1;
				output += parsedImage.original;
				continue;
			}

			const localImagePath = resolveExternalImagePath(originalDir, imageReference);
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
					assetVaultPath = await this.copyImageToVault(
						localImagePath,
						imageBytes,
						attachmentFolder,
						log
					);
					if (assetVaultPath) {
						copiedAssets.set(localImagePath, assetVaultPath);
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					log.missingImages.push(`${destinationMarkdownPath} ← ${imageReference} (${message})`);
					console.warn(`[MdAssetSync] ${this.t().imageNotFound}`, {
						destinationMarkdownPath,
						imageReference,
						localImagePath,
						error
					});
				}
			}

			if (assetVaultPath) {
				const relativePath = makeVaultRelativePath(destinationDirectory, assetVaultPath);
				output += `![${escapeMarkdownAltText(altText)}](${escapeMarkdownDestination(relativePath)})`;
			} else if (this.settings.keepMissingImageLinks) {
				output += parsedImage.original;
			}
		}

		output += markdown.slice(cursor);
		return output;
	}

	private async copyImageToVault(
		localImagePath: string,
		imageBytes: Buffer,
		attachmentFolder: string,
		log: ImportLog
	): Promise<string | undefined> {
		const originalName = path.basename(localImagePath);
		const sourceHash = createHash("md5").update(imageBytes).digest("hex");
		let candidatePath = joinVaultPath(attachmentFolder, originalName);
		let existing = this.app.vault.getAbstractFileByPath(candidatePath);

		if (existing) {
			if (existing instanceof TFile && (await this.hasMatchingMd5(existing, sourceHash))) {
				log.reusedAssets.push(candidatePath);
				console.info(`[MdAssetSync] ${this.t().reusedSameName}`, candidatePath);
				return candidatePath;
			}

			log.conflicts.push(candidatePath);
			if (this.settings.collisionStrategy === "skip") {
				console.warn(`[MdAssetSync] ${this.t().skippedSameName}`, candidatePath);
				return undefined;
			}

			if (this.settings.collisionStrategy === "overwrite") {
				if (!(existing instanceof TFile)) {
					throw new Error(this.t().cannotOverwriteFolder(candidatePath));
				}
				// Existing binary attachments must be updated through Vault as well.
				await this.app.vault.modifyBinary(existing, bufferToArrayBuffer(imageBytes));
				console.warn(`[MdAssetSync] ${this.t().overwrittenSameName}`, candidatePath);
				return candidatePath;
			}

			const resolvedAsset = await this.findMd5SuffixedAssetPath(attachmentFolder, originalName, sourceHash);
			candidatePath = resolvedAsset.path;
			if (resolvedAsset.reused) {
				log.reusedAssets.push(candidatePath);
				console.info(`[MdAssetSync] ${this.t().reusedMd5Conflict}`, candidatePath);
				return candidatePath;
			}
			console.warn(`[MdAssetSync] ${this.t().conflictAppended}`, {
				existing: existing.path,
				replacement: candidatePath
			});
		}

		// createBinary is the Vault API equivalent of create for binary files.
		await this.app.vault.createBinary(candidatePath, bufferToArrayBuffer(imageBytes));
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
			const existingHash = createHash("md5").update(Buffer.from(existingBytes)).digest("hex");
			return existingHash === expectedHash;
		} catch (error) {
			console.warn(`[MdAssetSync] ${this.t().hashCompareFailed}`, existingFile.path, error);
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
			console.warn(`[MdAssetSync] ${this.t().unsafeAttachmentFolder}`, configured);
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
		} catch (error) {
			console.warn(`[MdAssetSync] ${this.t().attachmentConfigReadFailed}`, error);
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
		console.warn(`[MdAssetSync] ${this.t().markdownRenamed}`, candidate);
		return candidate;
	}

	private reportImportResult(log: ImportLog): void {
		const strings = this.t();
		console.group(`[MdAssetSync] ${strings.reportHeading}`);
		console.info(strings.reportImported, log.importedMarkdown.length, log.importedMarkdown);
		console.info(strings.reportReused, log.reusedAssets.length, log.reusedAssets);
		console.info(strings.reportSkipped, log.skippedRemoteOrEmbedded);
		if (log.missingImages.length > 0) console.warn(strings.reportMissing, log.missingImages);
		if (log.conflicts.length > 0) console.warn(strings.reportConflicts, log.conflicts);
		if (log.errors.length > 0) console.error(strings.reportErrors, log.errors);
		console.groupEnd();

		new Notice(
			strings.resultNotice(log.importedMarkdown.length, log.errors.length, log.missingImages.length, log.conflicts.length),
			8000
		);
	}
}

class MdAssetSyncSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: MdAssetSyncPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const strings = this.plugin.t();
		containerEl.empty();
		new Setting(containerEl).setName(strings.settingsHeading).setHeading();

		new Setting(containerEl)
			.setName(strings.languageName)
			.setDesc(strings.languageDesc)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("en", strings.languageEnglish)
					.addOption("zh-CN", strings.languageChinese)
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value as PluginLanguage;
						await this.plugin.saveSettings();
						this.plugin.refreshInterfaceLabels();
						this.display();
					})
			);

		new Setting(containerEl)
			.setName(strings.collisionName)
			.setDesc(strings.collisionDesc)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("append-md5", strings.collisionAppend)
					.addOption("overwrite", strings.collisionOverwrite)
					.addOption("skip", strings.collisionSkip)
					.setValue(this.plugin.settings.collisionStrategy)
					.onChange(async (value) => {
						this.plugin.settings.collisionStrategy = value as CollisionStrategy;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(strings.linkFormatName)
			.setDesc(strings.linkFormatDesc)
			.addText((text) => text.setValue(strings.linkFormatValue).setDisabled(true));

		new Setting(containerEl)
			.setName(strings.keepMissingName)
			.setDesc(strings.keepMissingDesc)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.keepMissingImageLinks).onChange(async (value) => {
					this.plugin.settings.keepMissingImageLinks = value;
					await this.plugin.saveSettings();
				})
			);
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
			.getAllLoadedFiles()
			.filter((file): file is TFolder => file instanceof TFolder)
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

async function chooseMarkdownFiles(markdownFilter: string): Promise<string[]> {
	const dialog = getElectronDialog();
	if (dialog) {
		const result = await dialog.showOpenDialog({
			properties: ["openFile", "multiSelections"],
			filters: [{ name: markdownFilter, extensions: ["md", "markdown"] }]
		});
		return result.canceled ? [] : result.filePaths;
	}

	// Obsidian desktop normally exposes Electron's dialog. This keeps the command usable
	// if a future version removes that bridge while still using the OS file chooser.
	return chooseMarkdownFilesWithInput();
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

function chooseMarkdownFilesWithInput(): Promise<string[]> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".md,.markdown,text/markdown";
		input.multiple = true;
		input.setCssStyles({ display: "none" });
		document.body.appendChild(input);

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
		return { altText, imageReference, original };
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

function normalizeReferenceLabel(label: string): string {
	return unescapeMarkdownText(label).trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase();
}

function isRemoteOrEmbeddedImage(imagePath: string): boolean {
	const reference = imagePath.trim();
	return /^(https?:\/\/|data:)/i.test(reference) || (/^[a-z][a-z0-9+.-]+:/i.test(reference) && !/^file:/i.test(reference));
}

function resolveExternalImagePath(originalDir: string, imageReference: string): string {
	const unescapedReference = unescapeMarkdownText(imageReference.trim());
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
	return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}
