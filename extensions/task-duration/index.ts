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

const ENTRY_TYPE = "task-duration";

interface TaskDurationEntry {
	durationMs: number;
	completedAt: number;
}

export default function taskDuration(pi: ExtensionAPI): void {
	let startedAt: number | undefined;

	pi.registerEntryRenderer<TaskDurationEntry>(
		ENTRY_TYPE,
		(
			entry: CustomEntry<TaskDurationEntry>,
			_options: EntryRenderOptions,
			theme: Theme,
		) => {
				const rawDuration = entry.data?.durationMs;
			const durationMs =
				typeof rawDuration === "number" && Number.isFinite(rawDuration)
					? rawDuration
					: 0;
			return new Text(
				mutedLine(theme, `本次任务耗时 ${formatDuration(durationMs)}`),
				0,
				0,
			);
		},
	);

	pi.on("agent_start", (_event: unknown, ctx: ExtensionContext) => {
		if (ctx.mode !== "tui" || startedAt !== undefined) return;
		startedAt = performance.now();
	});

	pi.on("agent_settled", (_event: unknown, ctx: ExtensionContext) => {
		if (ctx.mode !== "tui" || startedAt === undefined) return;
		const durationMs = Math.max(0, performance.now() - startedAt);
		startedAt = undefined;
		pi.appendEntry<TaskDurationEntry>(ENTRY_TYPE, {
			durationMs,
			completedAt: Date.now(),
		});
	});

	pi.on("session_shutdown", () => {
		startedAt = undefined;
	});
}
