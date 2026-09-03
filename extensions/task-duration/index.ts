import { performance } from "node:perf_hooks";
import type {
	CustomEntry,
	EntryRenderOptions,
	ExtensionAPI,
	ExtensionContext,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	formatDuration,
	mutedLine,
} from "../shared/tui/visual-language.js";
import { SubagentTimeTracker } from "./subagent-time.js";

const ENTRY_TYPE = "task-duration";

interface TaskDurationEntry {
	durationMs: number;
	completedAt: number;
	/** Wall-clock time with at least one subagent running during the task. */
	subagentMs?: number;
	peakSubagents?: number;
}

function finiteMs(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function formatTaskDuration(entry: TaskDurationEntry | undefined): string {
	const base = `本次任务耗时 ${formatDuration(finiteMs(entry?.durationMs))}`;
	const subagentMs = finiteMs(entry?.subagentMs);
	if (subagentMs <= 0) return base;
	const peak = finiteMs(entry?.peakSubagents);
	const parallel = peak > 1 ? `，峰值 ${peak} 个并行` : "";
	return `${base} · 子 Agent 运行 ${formatDuration(subagentMs)}${parallel}`;
}

export default function taskDuration(pi: ExtensionAPI): void {
	let startedAt: number | undefined;
	let subagents: SubagentTimeTracker | undefined;

	pi.registerEntryRenderer<TaskDurationEntry>(
		ENTRY_TYPE,
		(
			entry: CustomEntry<TaskDurationEntry>,
			_options: EntryRenderOptions,
			theme: Theme,
		) => new Text(mutedLine(theme, formatTaskDuration(entry.data)), 0, 0),
	);

	pi.on("agent_start", (_event: unknown, ctx: ExtensionContext) => {
		if (ctx.mode !== "tui" || startedAt !== undefined) return;
		startedAt = performance.now();
		subagents ??= new SubagentTimeTracker(() => performance.now());
		subagents.reset();
	});

	pi.on("agent_settled", (_event: unknown, ctx: ExtensionContext) => {
		if (ctx.mode !== "tui" || startedAt === undefined) return;
		const durationMs = Math.max(0, performance.now() - startedAt);
		startedAt = undefined;
		const { subagentMs, peakSubagents } = subagents?.snapshot() ?? {
			subagentMs: 0,
			peakSubagents: 0,
		};
		pi.appendEntry<TaskDurationEntry>(ENTRY_TYPE, {
			durationMs,
			completedAt: Date.now(),
			subagentMs,
			peakSubagents,
		});
	});

	pi.on("session_shutdown", () => {
		startedAt = undefined;
		subagents?.dispose();
		subagents = undefined;
	});
}
