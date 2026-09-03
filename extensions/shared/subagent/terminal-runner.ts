import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
	loadSubagentUiConfig,
	resolvePresentation,
	type SubagentPresentation,
} from "./config.js";
import type {
	SubagentTurnResult,
	SubagentTurnUpdate,
} from "./registry.js";
import { runRpcSubagent } from "./rpc-runner.js";
import { prepareTaskArtifacts, SUBAGENT_RUNS_ROOT } from "./run-paths.js";
import { launchWindowsTerminal } from "./windows-terminal.js";

export type TerminalSubagentUpdate = SubagentTurnUpdate;
export type TerminalSubagentResult = SubagentTurnResult;

export interface TerminalSubagentOptions {
	cwd: string;
	title: string;
	model: string;
	thinkingLevel?: string;
	task: string;
	systemPrompt: string;
	tools: string;
	extensionPaths?: string[];
	extraCliArgs?: string[];
	loadDefaultResources?: boolean;
	disableContextFiles?: boolean;
	artifactFiles?: string[];
	presentation?: SubagentPresentation;
	parentSessionId?: string;
	/** Pre-assigned subagent id so callers can hand out a handle before launch. */
	runId?: string;
	keepOpen?: boolean;
	abortSettleTimeoutMs?: number;
	env?: Record<string, string>;
	signal?: AbortSignal;
	onUpdate?: (update: TerminalSubagentUpdate) => void;
}

export function appendThinkingCliArgs(
	args: string[],
	thinkingLevel: string | undefined,
): void {
	if (!thinkingLevel) return;
	args.push("--thinking", thinkingLevel);
}

interface RunEvent {
	kind?: string;
	text?: string;
	name?: string;
	arguments?: Record<string, unknown>;
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function cleanupOldRuns(retainMinutes: number): Promise<void> {
	await mkdir(SUBAGENT_RUNS_ROOT, { recursive: true, mode: 0o700 });
	const cutoff = Date.now() - retainMinutes * 60_000;
	for (const name of await readdir(SUBAGENT_RUNS_ROOT)) {
		const path = join(SUBAGENT_RUNS_ROOT, name);
		try {
			if (
				existsSync(join(path, "exited.json")) &&
				statSync(path).mtimeMs < cutoff
			)
				await rm(path, { recursive: true, force: true });
		} catch {
			// A concurrently active run may disappear while cleanup scans it.
		}
	}
}

function readEvents(path: string): RunEvent[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter(Boolean)
		.flatMap((line) => {
			try {
				return [JSON.parse(line) as RunEvent];
			} catch {
				return [];
			}
		});
}

function readResult(
	path: string,
): { output?: string; model?: string } | undefined {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as {
			output?: string;
			model?: string;
		};
	} catch {
		return undefined;
	}
}

export async function runTerminalSubagent(
	options: TerminalSubagentOptions,
): Promise<TerminalSubagentResult | null> {
	const config = loadSubagentUiConfig(options.presentation);
	const presentation = resolvePresentation(config);
	if (presentation === "manual")
		return runRpcSubagent({
			...options,
			keepOpen: options.keepOpen ?? config.keepOpen,
		});
	if (presentation === "inline") return null;
	if (process.platform !== "win32") {
		if (config.fallback === "inline") return null;
		throw new Error("交互式子 Agent 当前只支持原生 Windows Terminal");
	}
	await cleanupOldRuns(config.retainCompletedMinutes);
	const subagentId = options.runId ?? randomUUID();
	const runDir = join(SUBAGENT_RUNS_ROOT, subagentId);
	await mkdir(join(runDir, "sessions"), { recursive: true, mode: 0o700 });
	const task = await prepareTaskArtifacts(
		runDir,
		options.task,
		options.artifactFiles ?? [],
	);
	await Promise.all([
		writeFile(join(runDir, "task.md"), task, { encoding: "utf8", mode: 0o600 }),
		writeFile(join(runDir, "system-prompt.md"), options.systemPrompt, {
			encoding: "utf8",
			mode: 0o600,
		}),
	]);
	try {
		await launchWindowsTerminal(
			runDir,
			options,
			presentation,
			config.windowsTerminal.size,
			config.windowsTerminal.shell,
			config.keepOpen,
		);
	} catch (error) {
		if (config.fallback === "inline") return null;
		throw error;
	}

	const readyPath = join(runDir, "ready.json");
	const resultPath = join(runDir, "result.json");
	const exitedPath = join(runDir, "exited.json");
	const eventsPath = join(runDir, "events.jsonl");
	const cancelPath = join(runDir, "cancel");
	const startedAt = Date.now();
	let seenEvents = 0;
	let status = "正在 Windows Terminal 中启动子 Agent…";
	const toolCalls: TerminalSubagentUpdate["toolCalls"] = [];
	const update = () =>
		options.onUpdate?.({
			status,
			toolCalls: [...toolCalls],
			subagentId,
			reusable: false,
			turn: 1,
		});
	update();

	while (true) {
		if (options.signal?.aborted) {
			writeFileSync(cancelPath, "cancel", { encoding: "utf8", mode: 0o600 });
			throw new Error("子 Agent 已取消");
		}
		const events = readEvents(eventsPath);
		for (const event of events.slice(seenEvents)) {
			if (event.kind === "status" && event.text) status = event.text;
			if (event.kind === "tool_call" && event.name)
				toolCalls.push({
					name: event.name,
					arguments: event.arguments ?? {},
				});
		}
		if (events.length > seenEvents) {
			seenEvents = events.length;
			update();
		}
		if (existsSync(resultPath)) {
			const result = readResult(resultPath);
			if (result?.output)
				return {
					output: result.output,
					model: result.model,
					toolCalls,
					runDir,
					subagentId,
					reusable: false,
					turn: 1,
				};
		}
		if (existsSync(exitedPath))
			throw new Error("交互式子 Agent 在返回结果前已退出");
		if (!existsSync(readyPath) && Date.now() - startedAt > 15_000) {
			writeFileSync(cancelPath, "cancel", { encoding: "utf8", mode: 0o600 });
			if (config.fallback === "inline") return null;
			throw new Error("Windows Terminal 子 Agent 启动超时");
		}
		await delay(150);
	}
}
