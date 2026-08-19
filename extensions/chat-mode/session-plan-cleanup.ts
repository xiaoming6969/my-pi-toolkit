import {
	closeSync,
	existsSync,
	openSync,
	readdirSync,
	readSync,
	rmSync,
	rmdirSync,
	watch,
	type FSWatcher,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { DEBUG_ENDPOINT_FILENAME } from "./debug-endpoint.js";
const HEADER_BYTES = 4096;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function planPathFromSessionFile(
	sessionFile: string,
): string | undefined {
	let file: number | undefined;
	try {
		file = openSync(sessionFile, "r");
		const buffer = Buffer.alloc(HEADER_BYTES);
		const bytes = readSync(file, buffer, 0, buffer.length, 0);
		const firstLine = buffer.toString("utf8", 0, bytes).split("\n", 1)[0];
		const header = JSON.parse(firstLine) as { type?: unknown; id?: unknown };
		if (
			header.type !== "session" ||
			typeof header.id !== "string" ||
			!SESSION_ID_PATTERN.test(header.id)
		)
			return;
		return resolve(dirname(sessionFile), header.id, "plan.md");
	} catch {
		return;
	} finally {
		if (file !== undefined) closeSync(file);
	}
}

function removeSessionArtifacts(planPath: string): void {
	const artifactDirectory = dirname(planPath);
	rmSync(planPath, { force: true });
	rmSync(join(artifactDirectory, "debug.jsonl"), { force: true });
	rmSync(join(artifactDirectory, DEBUG_ENDPOINT_FILENAME), { force: true });
	try {
		rmdirSync(artifactDirectory);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== "ENOENT" && code !== "ENOTEMPTY") throw error;
	}
}

function collectSessions(root: string, sessions: Map<string, string>): void {
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const entryPath = join(root, entry.name);
		if (entry.isDirectory()) {
			collectSessions(entryPath, sessions);
		} else if (entry.isFile() && extname(entry.name) === ".jsonl") {
			const planPath = planPathFromSessionFile(entryPath);
			if (planPath) sessions.set(resolve(entryPath), planPath);
		}
	}
}

export function watchDeletedSessionPlans(
	sessionDir: string,
): FSWatcher | undefined {
	const root = dirname(resolve(sessionDir));
	const sessions = new Map<string, string>();
	try {
		collectSessions(root, sessions);
		const watcher = watch(
			root,
			{ recursive: true, persistent: false },
			(eventType, filename) => {
				if (eventType !== "rename" || !filename) return;
				const sessionFile = resolve(root, filename.toString());
				if (extname(sessionFile) !== ".jsonl") return;
				if (existsSync(sessionFile)) {
					const planPath = planPathFromSessionFile(sessionFile);
					if (planPath) sessions.set(sessionFile, planPath);
					return;
				}
				const planPath = sessions.get(sessionFile);
				if (!planPath) return;
				sessions.delete(sessionFile);
				try {
					removeSessionArtifacts(planPath);
				} catch {
					// Session deletion already succeeded; cleanup must not crash Pi.
				}
			},
		);
		watcher.on("error", () => watcher.close());
		return watcher;
	} catch {
		return;
	}
}

export function registerSessionPlanCleanup(pi: ExtensionAPI): void {
	let watcher: FSWatcher | undefined;
	pi.on("session_start", (_event: SessionStartEvent, ctx: ExtensionContext) => {
		watcher?.close();
		const sessionDir = ctx.sessionManager.getSessionDir();
		watcher = sessionDir ? watchDeletedSessionPlans(sessionDir) : undefined;
	});
	pi.on("session_shutdown", () => {
		watcher?.close();
		watcher = undefined;
	});
}
