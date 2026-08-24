import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { openUrl } from "../shared/open-url.js";
import { processReviewSubmission } from "./feedback.js";
import type {
	BrowserReviewOpenOptions,
	BrowserReviewResult,
	BrowserReviewSource,
} from "./types.js";

const MAX_BODY_BYTES = 128 * 1024;
const ASSETS = {
	"": { file: "review.html", type: "text/html; charset=utf-8" },
	"style.css": { file: "review.css", type: "text/css; charset=utf-8" },
	"review.js": { file: "review.js", type: "text/javascript; charset=utf-8" },
} as const;

function securityHeaders(response: ServerResponse): void {
	response.setHeader("Cache-Control", "no-store");
	response.setHeader("X-Content-Type-Options", "nosniff");
	response.setHeader("Referrer-Policy", "no-referrer");
	response.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'");
}

function json(response: ServerResponse, status: number, value: unknown): void {
	securityHeaders(response);
	response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		let tooLarge = false;
		request.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) tooLarge = true;
			else chunks.push(chunk);
		});
		request.on("end", () => {
			if (tooLarge) {
				reject(new Error("请求体过大"));
				return;
			}
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
			} catch {
				reject(new Error("JSON 无效"));
			}
		});
		request.on("error", reject);
	});
}

class BrowserReviewSession {
	private readonly token = randomBytes(32).toString("hex");
	private settled = false;
	private resolve!: (result: BrowserReviewResult) => void;
	private readonly result = new Promise<BrowserReviewResult>((resolve) => {
		this.resolve = resolve;
	});
	private readonly server = createServer(
		(request: IncomingMessage, response: ServerResponse) => {
			void this.handle(request, response);
		},
	);

	constructor(
		private readonly source: BrowserReviewSource,
		private readonly options: BrowserReviewOpenOptions,
	) {
		this.server.on("clientError", (_error: Error, socket: Socket) =>
			socket.destroy(),
		);
	}

	async run(): Promise<BrowserReviewResult> {
		const abort = () => this.finish({ status: "closed" });
		if (this.options.signal?.aborted) return { status: "closed" };
		this.options.signal?.addEventListener("abort", abort, { once: true });
		try {
			await new Promise<void>((resolve, reject) => {
				this.server.once("error", reject);
				this.server.listen(0, "127.0.0.1", () => {
					this.server.off("error", reject);
					resolve();
				});
			});
			const port = (this.server.address() as AddressInfo).port;
			const error = await (this.options.openBrowser ?? openUrl)(
				`http://127.0.0.1:${port}/review/${this.token}/`,
			);
			if (error) this.finish({ status: "unavailable", error });
			return await this.result;
		} catch (error) {
			this.finish({
				status: "unavailable",
				error: error instanceof Error ? error.message : String(error),
			});
			return await this.result;
		} finally {
			this.options.signal?.removeEventListener("abort", abort);
			await this.closeServer();
		}
	}

	close(): void {
		this.finish({ status: "closed" });
	}

	private finish(result: BrowserReviewResult): void {
		if (this.settled) return;
		this.settled = true;
		this.resolve(result);
	}

	private async closeServer(): Promise<void> {
		this.server.closeAllConnections?.();
		if (!this.server.listening) return;
		await new Promise<void>((resolve) => this.server.close(() => resolve()));
	}

	private async handle(
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		const prefix = `/review/${this.token}/`;
		const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
		if (!pathname.startsWith(prefix)) {
			response.writeHead(404).end();
			return;
		}
		const route = pathname.slice(prefix.length);
		if (request.method === "GET" && route === "data") {
			json(response, 200, this.source);
			return;
		}
		if (request.method === "GET" && route in ASSETS) {
			const asset = ASSETS[route as keyof typeof ASSETS];
			try {
				const content = await readFile(new URL(`./assets/${asset.file}`, import.meta.url));
				securityHeaders(response);
				response.writeHead(200, { "Content-Type": asset.type });
				response.end(content);
			} catch {
				response.writeHead(500).end();
			}
			return;
		}
		if (request.method !== "POST" || route !== "submit") {
			response.writeHead(405, { Allow: "GET, POST" }).end();
			return;
		}
		try {
			const result = processReviewSubmission(this.source, await readBody(request));
			json(response, 200, { ok: true });
			this.finish(result);
		} catch (error) {
			json(response, 400, {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

export class BrowserReviewManager {
	private readonly sessions = new Set<BrowserReviewSession>();

	async open(
		source: BrowserReviewSource,
		options: BrowserReviewOpenOptions = {},
	): Promise<BrowserReviewResult> {
		const session = new BrowserReviewSession(source, options);
		this.sessions.add(session);
		try {
			return await session.run();
		} finally {
			this.sessions.delete(session);
		}
	}

	dispose(): void {
		for (const session of this.sessions) session.close();
		this.sessions.clear();
	}
}
