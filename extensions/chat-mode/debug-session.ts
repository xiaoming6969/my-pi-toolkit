import { randomBytes } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import type { Socket } from "node:net";
import { basename, dirname } from "node:path";
import {
	debugEndpointConfigPath,
	debugLogPathFromArtifact,
	readPersistedDebugEndpoint,
	removePersistedDebugEndpoint,
	setDebugCorsHeaders,
	writePersistedDebugEndpoint,
	type DebugSessionEndpoint,
} from "./debug-endpoint.js";
import { latestReproductionStepsLine } from "./debug-log-format.js";

export { debugLogPathFromArtifact } from "./debug-endpoint.js";
export const MAX_DEBUG_REQUEST_BYTES = 64 * 1024;
export const MAX_DEBUG_LOG_BYTES = 5 * 1024 * 1024;
export type DebugSessionListener = () => void;

export class DebugSessionCollector {
	readonly logPath: string;
	readonly endpointConfigPath: string;
	private server?: ReturnType<typeof createServer>;
	private watcher?: FSWatcher;
	private watcherStarting?: Promise<void>;
	private endpoint?: DebugSessionEndpoint;
	private starting?: Promise<DebugSessionEndpoint>;
	private appendQueue: Promise<void> = Promise.resolve();
	private readonly listeners = new Set<DebugSessionListener>();

	constructor(artifactDirectoryOrPlanPath: string) {
		this.logPath = debugLogPathFromArtifact(artifactDirectoryOrPlanPath);
		this.endpointConfigPath = debugEndpointConfigPath(this.logPath);
	}

	ensure(): Promise<DebugSessionEndpoint> {
		if (this.endpoint) return Promise.resolve(this.endpoint);
		if (this.starting) return this.starting;
		this.starting = this.startServer().finally(() => {
			this.starting = undefined;
		});
		return this.starting;
	}

	start(): Promise<DebugSessionEndpoint> {
		return this.ensure();
	}

	async readText(): Promise<string> {
		try {
			return await readFile(this.logPath, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
			throw error;
		}
	}

	async readLines(): Promise<string[]> {
		const text = await this.readText();
		return text.split(/\r?\n/).filter((line) => line.length > 0);
	}

	async clear(): Promise<void> {
		await this.enqueue(async () => {
			await mkdir(dirname(this.logPath), { recursive: true });
			const reproductionSteps = latestReproductionStepsLine(
				await this.readText(),
			);
			await writeFile(
				this.logPath,
				reproductionSteps ? `${reproductionSteps}\n` : "",
				"utf8",
			);
			this.notify();
		});
	}

	async clearAll(): Promise<void> {
		await this.enqueue(async () => {
			await mkdir(dirname(this.logPath), { recursive: true });
			await writeFile(this.logPath, "", "utf8");
			this.notify();
		});
	}

	subscribe(listener: DebugSessionListener): () => void {
		this.listeners.add(listener);
		void this.ensureWatcher();
		return () => this.listeners.delete(listener);
	}

	async stop(): Promise<void> {
		if (this.starting) {
			try {
				await this.starting;
			} catch {
				// A failed start has nothing to stop.
			}
		}
		if (this.watcherStarting) await this.watcherStarting.catch(() => undefined);
		this.watcher?.close();
		this.watcher = undefined;
		const server = this.server;
		this.server = undefined;
		this.endpoint = undefined;
		if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
	}

	dispose(): Promise<void> {
		return this.stop();
	}

	forgetEndpoint(): Promise<void> {
		return removePersistedDebugEndpoint(this.endpointConfigPath);
	}

	private async startServer(): Promise<DebugSessionEndpoint> {
		await mkdir(dirname(this.logPath), { recursive: true });
		await this.ensureWatcher();
		const persisted = await readPersistedDebugEndpoint(
			this.endpointConfigPath,
		);
		const token = persisted?.token ?? randomBytes(32).toString("hex");
		const secretPath = `/debug/${token}`;
		const server = createServer();
		server.on(
			"request",
			(request: IncomingMessage, response: ServerResponse) => {
				const pathname = new URL(
					request.url ?? "/",
					"http://127.0.0.1",
				).pathname;
				if (pathname !== secretPath) {
					response.writeHead(404).end();
					return;
				}
				if (!setDebugCorsHeaders(request, response)) {
					response.writeHead(403).end();
					return;
				}
				if (request.method === "OPTIONS") {
					response.writeHead(204).end();
					return;
				}
				if (request.method !== "POST") {
					response.writeHead(405, { Allow: "POST, OPTIONS" }).end();
					return;
				}
				void this.receive(request, response);
			},
		);
		server.on("clientError", (_error: Error, socket: Socket) => socket.destroy());
		await new Promise<void>((resolveListen, reject) => {
			server.once("error", reject);
			server.listen(persisted?.port ?? 0, "127.0.0.1", () => {
				server.off("error", reject);
				resolveListen();
			});
		});
		const address = server.address();
		if (!address || typeof address === "string") {
			server.close();
			throw new Error("Debug collector did not receive a TCP address");
		}
		const endpoint = {
			logPath: this.logPath,
			endpoint: `http://127.0.0.1:${address.port}${secretPath}`,
		};
		try {
			await writePersistedDebugEndpoint(this.endpointConfigPath, {
				port: address.port,
				token,
			});
		} catch (error) {
			await new Promise<void>((resolveClose) =>
				server.close(() => resolveClose()),
			);
			throw error;
		}
		this.server = server;
		this.endpoint = endpoint;
		return endpoint;
	}

	private receive(
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		return new Promise((resolveRequest) => {
			const chunks: Buffer[] = [];
			let size = 0;
			let tooLarge = false;
			request.on("data", (chunk: Buffer) => {
				size += chunk.length;
				if (size > MAX_DEBUG_REQUEST_BYTES) tooLarge = true;
				else chunks.push(chunk);
			});
			request.on("end", async () => {
				if (tooLarge) {
					response.writeHead(413).end();
					resolveRequest();
					return;
				}
				const text = Buffer.concat(chunks).toString("utf8");
				let record: Record<string, unknown>;
				if ((request.headers["content-type"] ?? "").toLowerCase().includes("application/json")) {
					try {
						const value: unknown = JSON.parse(text);
						record = value !== null && typeof value === "object" && !Array.isArray(value)
							? { ...(value as Record<string, unknown>), timestamp: new Date().toISOString() }
							: { value, timestamp: new Date().toISOString() };
					} catch {
						response.writeHead(400).end();
						resolveRequest();
						return;
					}
				} else record = { message: text, timestamp: new Date().toISOString() };
				const line = `${JSON.stringify(record)}\n`;
				try {
					await this.enqueueAppend(
						line,
						record.type === "reproduction_steps",
					);
					response.writeHead(204).end();
				} catch (error) {
					response.writeHead(error instanceof LogLimitError ? 413 : 500).end();
				}
				resolveRequest();
			});
			request.on("error", () => resolveRequest());
		});
	}

	private enqueueAppend(line: string, replace = false): Promise<void> {
		return this.enqueue(async () => {
			await mkdir(dirname(this.logPath), { recursive: true });
			let currentSize = 0;
			try {
				currentSize = replace ? 0 : (await stat(this.logPath)).size;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			if (currentSize + Buffer.byteLength(line) > MAX_DEBUG_LOG_BYTES) {
				throw new LogLimitError();
			}
			if (replace) await writeFile(this.logPath, line, "utf8");
			else await appendFile(this.logPath, line, "utf8");
			this.notify();
		});
	}

	private enqueue(operation: () => Promise<void>): Promise<void> {
		const result = this.appendQueue.then(operation);
		this.appendQueue = result.catch(() => undefined);
		return result;
	}

	private ensureWatcher(): Promise<void> {
		if (this.watcher) return Promise.resolve();
		if (this.watcherStarting) return this.watcherStarting;
		this.watcherStarting = this.openWatcher().finally(() => {
			this.watcherStarting = undefined;
		});
		return this.watcherStarting;
	}

	private async openWatcher(): Promise<void> {
		await mkdir(dirname(this.logPath), { recursive: true });
		this.watcher = watch(dirname(this.logPath), { persistent: false }, (_event, filename) => {
			if (!filename || filename.toString() === basename(this.logPath)) this.notify();
		});
		this.watcher.on("error", () => {
			this.watcher?.close();
			this.watcher = undefined;
		});
	}

	private notify(): void {
		this.listeners.forEach((listener) => {
			try {
				listener();
			} catch {
				// A UI listener must not interrupt collection or other listeners.
			}
		});
	}
}

class LogLimitError extends Error {}

export const createDebugSessionCollector = (artifactPath: string) =>
	new DebugSessionCollector(artifactPath);
