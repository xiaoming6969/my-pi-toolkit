import {
	listBackgroundSubagents,
	type BackgroundSubagentJob,
} from "../../shared/subagent/background.js";
import {
	listLiveSubagents,
	type LiveSubagentRun,
} from "../../shared/subagent/registry.js";

export interface SubagentFooterCounts {
	running: number;
	queued: number;
	idle: number;
}

/**
 * Group children for the Footer: running = live turns in flight, queued =
 * follow-ups waiting on a live child plus background jobs waiting for a slot,
 * idle = reusable children kept alive for follow-ups.
 */
export function countSubagentGroups(
	runs: LiveSubagentRun[],
	jobs: BackgroundSubagentJob[],
): SubagentFooterCounts {
	const counts: SubagentFooterCounts = { running: 0, queued: 0, idle: 0 };
	const liveIds = new Set(runs.map((run) => run.id));
	for (const run of runs) {
		if (run.status === "starting" || run.status === "running") counts.running += 1;
		else if (run.reusable) counts.idle += 1;
		counts.queued += run.queuedCount ?? 0;
	}
	for (const job of jobs) {
		if (job.status === "queued") counts.queued += 1;
		// A running job that has not registered a live child yet still counts once.
		else if (job.status === "running" && !liveIds.has(job.id)) counts.running += 1;
	}
	return counts;
}

/** `subagent 2 run · 1 queued · 1 idle`; undefined hides the segment. */
export function formatSubagentFooterStatus(
	counts: SubagentFooterCounts,
): string | undefined {
	const parts = [
		counts.running > 0 ? `${counts.running} run` : undefined,
		counts.queued > 0 ? `${counts.queued} queued` : undefined,
		counts.idle > 0 ? `${counts.idle} idle` : undefined,
	].filter((part): part is string => part !== undefined);
	return parts.length > 0 ? `subagent ${parts.join(" · ")}` : undefined;
}

export function currentSubagentFooterStatus(): string | undefined {
	return formatSubagentFooterStatus(
		countSubagentGroups(listLiveSubagents(), listBackgroundSubagents()),
	);
}
