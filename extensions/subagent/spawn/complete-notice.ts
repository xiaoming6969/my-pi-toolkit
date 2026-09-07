import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	getBackgroundSubagent,
	isBackgroundJobActive,
	type BackgroundSubagentJob,
} from "../../shared/subagent/background.js";

const pending = new Set<string>();
const consumed = new Set<string>();
const sent = new Set<string>();
const busySessions = new Set<string>();

function sessionId(ctx: ExtensionContext): string {
	return ctx.sessionManager.getSessionId();
}

function completionNotice(job: BackgroundSubagentJob): string {
	const outcome =
		job.status === "completed"
			? "finished successfully"
			: job.status === "cancelled"
				? "was cancelled"
				: `failed: ${job.error ?? "unknown error"}`;
	return `Background subagent ${job.id} (${job.title}) ${outcome}. Do not poll background subagents; call subagent_output with this id to read the report, then continue the main task.`;
}

function deliver(pi: ExtensionAPI, job: BackgroundSubagentJob): void {
	pending.delete(job.id);
	sent.add(job.id);
	try {
		pi.sendMessage(
			{
				customType: "subagent-complete",
				content: completionNotice(job),
				display: true,
				details: { subagentId: job.id, status: job.status },
			},
			{ deliverAs: "followUp", triggerTurn: true },
		);
	} catch {
		sent.delete(job.id);
	}
}

function flush(pi: ExtensionAPI, parentSessionId: string): void {
	for (const id of Array.from(pending)) {
		const job = getBackgroundSubagent(id);
		if (!job || job.parentSessionId !== parentSessionId) {
			if (!job) pending.delete(id);
			continue;
		}
		deliver(pi, job);
	}
}

/** Queue a completion follow-up; send now only if the parent session is idle. */
export function enqueueBackgroundCompletionNotice(
	job: BackgroundSubagentJob,
	pi: ExtensionAPI,
): void {
	if (consumed.has(job.id) || sent.has(job.id)) return;
	pending.add(job.id);
	if (!busySessions.has(job.parentSessionId)) deliver(pi, job);
}

/** Suppress the follow-up after the parent has read a settled report. */
export function markBackgroundCompletionConsumed(id: string): void {
	const job = getBackgroundSubagent(id);
	if (!job || isBackgroundJobActive(job)) return;
	consumed.add(job.id);
	pending.delete(job.id);
}

export function registerBackgroundCompletionNotices(pi: ExtensionAPI): void {
	pi.on("agent_start", (_event: unknown, ctx: ExtensionContext) => {
		busySessions.add(sessionId(ctx));
	});
	pi.on("agent_settled", (_event: unknown, ctx: ExtensionContext) => {
		if (!ctx.isIdle()) return;
		const id = sessionId(ctx);
		busySessions.delete(id);
		flush(pi, id);
	});
	pi.on("session_shutdown", (_event: unknown, ctx: ExtensionContext) => {
		const id = sessionId(ctx);
		busySessions.delete(id);
		for (const jobId of Array.from(pending)) {
			const job = getBackgroundSubagent(jobId);
			if (!job || job.parentSessionId === id) pending.delete(jobId);
		}
	});
}
