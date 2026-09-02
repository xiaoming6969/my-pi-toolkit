import type { LiveSubagentRun } from "../../shared/subagent/registry.js";
import {
	formatDuration,
	UI_GLYPHS,
} from "../../shared/tui/visual-language.js";

export type RunDisplayState =
	| "starting"
	| "running"
	| "completed"
	| "failed"
	| "exited";

function runIcon(state: RunDisplayState): string {
	if (state === "starting" || state === "running") return UI_GLYPHS.active;
	if (state === "completed") return UI_GLYPHS.success;
	if (state === "failed") return UI_GLYPHS.error;
	return UI_GLYPHS.pending;
}

function liveMetrics(run: LiveSubagentRun | undefined): string {
	if (!run) return "";
	const metrics: string[] = [];
	if ((run.queuedCount ?? 0) > 0) metrics.push(`queued ${run.queuedCount}`);
	if (run.status === "running" && run.turnStartedAt) {
		const startedAt = Date.parse(run.turnStartedAt);
		if (Number.isFinite(startedAt))
			metrics.push(`running ${formatDuration(Date.now() - startedAt)}`);
	} else if (run.idleDeadlineAt) {
		const deadline = Date.parse(run.idleDeadlineAt);
		if (Number.isFinite(deadline))
			metrics.push(`idle ${formatDuration(deadline - Date.now())}`);
	}
	return metrics.length > 0 ? ` · ${metrics.join(" · ")}` : "";
}

function formatLocalTime(value: string | undefined): string {
	if (!value) return "未就绪";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString(undefined, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

export function formatRunLabel(run: {
	title: string;
	state: RunDisplayState;
	startedAt?: string;
	live?: LiveSubagentRun;
}): string {
	return `${runIcon(run.state)} ${run.title} · ${run.state}${liveMetrics(run.live)} · ${formatLocalTime(run.startedAt)}`;
}
