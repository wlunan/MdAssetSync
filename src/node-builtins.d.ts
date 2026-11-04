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

declare module "node:http" {
	interface IncomingMessage {
		headers: Record<string, string | string[] | undefined>;
		statusCode?: number;
		on(eventName: "data", listener: (chunk: Uint8Array) => void): this;
		on(eventName: "end", listener: () => void): this;
		on(eventName: "error", listener: (error: Error) => void): this;
		destroy(): this;
		resume(): this;
	}

	interface RequestOptions {
		headers?: Record<string, string>;
		host?: string;
		method?: string;
		path?: string;
		port?: number;
		protocol?: string;
	}

	interface ClientRequest {
		on(eventName: "response", listener: (response: IncomingMessage) => void): this;
		on(eventName: "error", listener: (error: Error) => void): this;
		setTimeout(timeoutMs: number, callback: () => void): this;
		destroy(): this;
	}

	export function get(options: RequestOptions | string, callback?: (response: IncomingMessage) => void): ClientRequest;
}

declare module "node:https" {
	import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";

	export function get(options: RequestOptions | string, callback?: (response: IncomingMessage) => void): ClientRequest;
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
