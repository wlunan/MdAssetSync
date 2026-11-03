/**
 * Minimal Node.js declarations for the built-ins used by this desktop-only plugin.
 * Keeping them local prevents lint scanners without @types/node from treating every
 * Node API as `any`.
 */

declare module "node:crypto" {
	interface Hash {
		digest(encoding: "hex"): string;
		update(data: string | Uint8Array): Hash;
	}

	export function createHash(algorithm: string): Hash;
}

declare module "node:fs" {
	interface Stats {
		isFile(): boolean;
	}

	interface FileSystemPromises {
		readFile(filePath: string, encoding: "utf8"): Promise<string>;
		readFile(filePath: string): Promise<Uint8Array>;
		stat(filePath: string): Promise<Stats>;
	}

	export const promises: FileSystemPromises;
}

declare module "node:path" {
	export function basename(filePath: string, suffix?: string): string;
	export function dirname(filePath: string): string;
	export function extname(filePath: string): string;
	export function isAbsolute(filePath: string): boolean;
	export function normalize(filePath: string): string;
	export function resolve(...pathSegments: string[]): string;
	export const sep: string;
	export const posix: {
		basename(filePath: string, suffix?: string): string;
		relative(from: string, to: string): string;
	};
}

declare module "node:url" {
	export function fileURLToPath(fileUrl: string): string;
}
