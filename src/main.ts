import { App, Modal, Notice, Platform, Plugin, PluginSettingTab, Setting, TFile, TFolder, normalizePath } from "obsidian";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";

type CollisionStrategy = "append-md5" | "overwrite" | "skip";

interface MdAssetSyncSettings {
	collisionStrategy: CollisionStrategy;
	keepMissingImageLinks: boolean;
}

interface ImportLog {
	importedMarkdown: string[];
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

const DEFAULT_SETTINGS: MdAssetSyncSettings = {
	collisionStrategy: "append-md5",
	keepMissingImageLinks: true
};

// This intentionally handles only the standard Markdown image form requested by the plugin.
// Angle-bracket destinations allow standard Markdown paths containing spaces.
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(\s*(<[^>\n]+>|(?:\\.|[^\s)])+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;

export default class MdAssetSyncPlugin extends Plugin {
	settings: MdAssetSyncSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "import-external-markdown-and-assets",
			name: "导入外部Markdown并同步图片资源",
			callback: () => this.importExternalMarkdown()
		});

		this.addSettingTab(new MdAssetSyncSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async importExternalMarkdown(): Promise<void> {
		if (!Platform.isDesktopApp) {
			new Notice("MdAssetSync 仅支持 Obsidian 桌面端。");
			return;
		}

		const sourcePaths = await chooseMarkdownFiles();
		if (sourcePaths.length === 0) {
			return;
		}

		const targetFolder = await chooseVaultFolder(this.app);
		if (targetFolder === null) {
			return;
		}

		const log: ImportLog = {
			importedMarkdown: [],
			missingImages: [],
			conflicts: [],
			errors: [],
			skippedRemoteOrEmbedded: 0
		};
		const progress = new Notice("MdAssetSync：正在准备导入…", 0);

		for (let index = 0; index < sourcePaths.length; index += 1) {
			const sourcePath = sourcePaths[index];
			progress.setMessage(`MdAssetSync：正在导入 ${index + 1}/${sourcePaths.length}：${path.basename(sourcePath)}`);

			try {
				await this.importOneMarkdown(sourcePath, targetFolder, log);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				log.errors.push(`${sourcePath}：${message}`);
				console.error("[MdAssetSync] 导入 Markdown 失败", sourcePath, error);
			}
		}

		progress.hide();
		this.reportImportResult(log);
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
		const matches = Array.from(markdown.matchAll(MARKDOWN_IMAGE_PATTERN));
		if (matches.length === 0) {
			return markdown;
		}

		const copiedAssets = new Map<string, string>();
		let output = "";
		let cursor = 0;
		const destinationDirectory = parentVaultPath(destinationMarkdownPath);

		for (const match of matches) {
			const matchStart = match.index ?? 0;
			output += markdown.slice(cursor, matchStart);
			cursor = matchStart + match[0].length;

			const altText = match[1];
			const imageReference = removeAngleBrackets(match[2]);
			if (isRemoteOrEmbeddedImage(imageReference)) {
				log.skippedRemoteOrEmbedded += 1;
				output += match[0];
				continue;
			}

			const localImagePath = resolveExternalImagePath(originalDir, imageReference);
			let assetVaultPath = copiedAssets.get(localImagePath);

			if (!assetVaultPath) {
				try {
					const imageStats = await fs.stat(localImagePath);
					if (!imageStats.isFile()) {
						throw new Error("路径不是文件");
					}

					const imageBytes = await fs.readFile(localImagePath);
					assetVaultPath = await this.copyImageToVault(
						localImagePath,
						imageBytes,
						destinationMarkdownPath,
						log
					);
					if (assetVaultPath) {
						copiedAssets.set(localImagePath, assetVaultPath);
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					log.missingImages.push(`${destinationMarkdownPath} ← ${imageReference}（${message}）`);
					console.warn("[MdAssetSync] 找不到图片", { destinationMarkdownPath, imageReference, localImagePath, error });
				}
			}

			if (assetVaultPath) {
				const relativePath = makeVaultRelativePath(destinationDirectory, assetVaultPath);
				output += `![${altText}](${escapeMarkdownDestination(relativePath)})`;
			} else if (this.settings.keepMissingImageLinks) {
				output += match[0];
			}
		}

		output += markdown.slice(cursor);
		return output;
	}

	private async copyImageToVault(
		localImagePath: string,
		imageBytes: Buffer,
		destinationMarkdownPath: string,
		log: ImportLog
	): Promise<string | undefined> {
		const attachmentFolder = this.getAttachmentFolder(destinationMarkdownPath);
		await this.ensureVaultFolder(attachmentFolder);

		const originalName = path.basename(localImagePath);
		let candidatePath = joinVaultPath(attachmentFolder, originalName);
		let existing = this.app.vault.getAbstractFileByPath(candidatePath);

		if (existing) {
			log.conflicts.push(candidatePath);
			if (this.settings.collisionStrategy === "skip") {
				console.warn("[MdAssetSync] 同名图片已跳过", candidatePath);
				return undefined;
			}

			if (this.settings.collisionStrategy === "overwrite") {
				if (!(existing instanceof TFile)) {
					throw new Error(`无法覆盖同名文件夹：${candidatePath}`);
				}
				// Existing binary attachments must be updated through Vault as well.
				await this.app.vault.modifyBinary(existing, bufferToArrayBuffer(imageBytes));
				console.warn("[MdAssetSync] 同名图片已覆盖", candidatePath);
				return candidatePath;
			}

			const md5 = createHash("md5").update(imageBytes).digest("hex");
			candidatePath = await this.findMd5SuffixedAssetPath(attachmentFolder, originalName, md5);
			console.warn("[MdAssetSync] 同名图片冲突，已追加 MD5 后缀", { existing: existing.path, replacement: candidatePath });
		}

		// createBinary is the Vault API equivalent of create for binary files.
		await this.app.vault.createBinary(candidatePath, bufferToArrayBuffer(imageBytes));
		return candidatePath;
	}

	private async findMd5SuffixedAssetPath(folder: string, originalName: string, md5: string): Promise<string> {
		const extension = path.extname(originalName);
		const baseName = extension ? originalName.slice(0, -extension.length) : originalName;
		let suffix = `-${md5}`;
		let candidate = joinVaultPath(folder, `${baseName}${suffix}${extension}`);
		let counter = 2;

		while (this.app.vault.getAbstractFileByPath(candidate)) {
			suffix = `-${md5}-${counter}`;
			candidate = joinVaultPath(folder, `${baseName}${suffix}${extension}`);
			counter += 1;
		}

		return candidate;
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
			console.warn("[MdAssetSync] 忽略不安全的 Obsidian 附件目录配置", configured);
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
			console.warn("[MdAssetSync] 无法读取 Obsidian 附件设置，将使用 assets 兜底目录", error);
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
				throw new Error(`附件目录路径被文件占用：${current}`);
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
		console.warn("[MdAssetSync] 同名 Markdown 已改名导入", candidate);
		return candidate;
	}

	private reportImportResult(log: ImportLog): void {
		console.group("[MdAssetSync] 导入结果");
		console.info("成功导入 Markdown：", log.importedMarkdown.length, log.importedMarkdown);
		console.info("跳过网络或内嵌图片：", log.skippedRemoteOrEmbedded);
		if (log.missingImages.length > 0) console.warn("找不到的图片：", log.missingImages);
		if (log.conflicts.length > 0) console.warn("冲突文件：", log.conflicts);
		if (log.errors.length > 0) console.error("导入失败：", log.errors);
		console.groupEnd();

		new Notice(
			`MdAssetSync：成功 ${log.importedMarkdown.length} 个；找不到图片 ${log.missingImages.length} 个；冲突 ${log.conflicts.length} 个。详情见开发者控制台。`,
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
		containerEl.empty();
		containerEl.createEl("h2", { text: "MdAssetSync 设置" });

		new Setting(containerEl)
			.setName("同名文件策略")
			.setDesc("导入的图片与目标附件目录中已有文件同名时的处理方式。")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("append-md5", "追加 MD5 后缀")
					.addOption("overwrite", "直接覆盖")
					.addOption("skip", "跳过并警告")
					.setValue(this.plugin.settings.collisionStrategy)
					.onChange(async (value) => {
						this.plugin.settings.collisionStrategy = value as CollisionStrategy;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("输出链接格式")
			.setDesc("固定为标准 Markdown 图片链接 ![]()；本插件不生成 Wiki 链接。")
			.addText((text) => text.setValue("标准 Markdown ![]()").setDisabled(true));

		new Setting(containerEl)
			.setName("保留找不到图片的原始链接")
			.setDesc("关闭后，找不到的本地图片会从 Markdown 正文移除；网络和 base64 图片始终保留。")
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

	constructor(app: App, private readonly onSelect: (folderPath: string | null) => void) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.createEl("h2", { text: "选择导入到 Vault 的文件夹" });
		const folders = this.app.vault
			.getAllLoadedFiles()
			.filter((file): file is TFolder => file instanceof TFolder)
			.map((folder) => folder.path)
			.filter((folderPath) => folderPath.length > 0)
			.sort((left, right) => left.localeCompare(right, "zh-CN"));

		new Setting(this.contentEl)
			.setName("目标文件夹")
			.setDesc("Markdown 会写入此 Vault 文件夹；图片位置遵循 Obsidian 原生附件设置。")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Vault 根目录");
				for (const folderPath of folders) {
					dropdown.addOption(folderPath, folderPath);
				}
				dropdown.setValue(this.selectedPath).onChange((value) => {
					this.selectedPath = value;
				});
			});

		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText("取消").onClick(() => this.finish(null)))
			.addButton((button) => button.setButtonText("开始导入").setCta().onClick(() => this.finish(this.selectedPath)));
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

async function chooseMarkdownFiles(): Promise<string[]> {
	const dialog = getElectronDialog();
	if (dialog) {
		const result = await dialog.showOpenDialog({
			properties: ["openFile", "multiSelections"],
			filters: [{ name: "Markdown", extensions: ["md", "markdown"] }]
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
		input.style.display = "none";
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

function chooseVaultFolder(app: App): Promise<string | null> {
	return new Promise((resolve) => {
		new VaultFolderPickerModal(app, resolve).open();
	});
}

function isRemoteOrEmbeddedImage(imagePath: string): boolean {
	return /^(https?:\/\/|data:)/i.test(imagePath.trim());
}

function resolveExternalImagePath(originalDir: string, imageReference: string): string {
	const decodedReference = safelyDecodeUriComponent(imageReference.trim());
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

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}
