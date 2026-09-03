import type { SubagentToolCall } from "./registry.js";
import type { SubagentRunResult } from "./run.js";

export type BackgroundSubagentStatus =
	| "queued"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

export interface BackgroundSubagentJob {
	id: string;
	title: string;
	parentSessionId: string;
	status: BackgroundSubagentStatus;
	startedAt: string;
	completedAt?: string;
	toolCalls: SubagentToolCall[];
	result?: SubagentRunResult;
	error?: string;
	controller: AbortController;
	/** Settles when the job leaves queued/running; never rejects. */
	settled: Promise<BackgroundSubagentJob>;
}

export interface StartBackgroundOptions {
	id: string;
	title: string;
	parentSessionId: string;
	run: (
		signal: AbortSignal,
		onToolCalls: (calls: SubagentToolCall[]) => void,
	) => Promise<SubagentRunResult>;
	/** Called after the job settles, before waiters resume. */
	onSettled?: (job: BackgroundSubagentJob) => void;
}

const JOBS_KEY = Symbol.for("my-pi-toolkit.background-subagent-jobs");
const globalState = globalThis as Record<PropertyKey, unknown>;
const existing = globalState[JOBS_KEY];
const jobs =
	existing instanceof Map
		? (existing as Map<string, BackgroundSubagentJob>)
		: new Map<string, BackgroundSubagentJob>();
globalState[JOBS_KEY] = jobs;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function subscribeBackgroundSubagents(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function isBackgroundJobActive(job: BackgroundSubagentJob): boolean {
	return job.status === "queued" || job.status === "running";
}

export function startBackgroundSubagent(
	options: StartBackgroundOptions,
): BackgroundSubagentJob {
	if (jobs.has(options.id))
		throw new Error(`后台子 Agent ID 已存在: ${options.id}`);
	const controller = new AbortController();
	let settle!: (job: BackgroundSubagentJob) => void;
	const job: BackgroundSubagentJob = {
		id: options.id,
		title: options.title,
		parentSessionId: options.parentSessionId,
		status: "queued",
		startedAt: new Date().toISOString(),
		toolCalls: [],
		controller,
		settled: new Promise((resolve) => {
			settle = resolve;
		}),
	};
	jobs.set(job.id, job);
	notify();
	const finish = (status: BackgroundSubagentStatus) => {
		job.status = status;
		job.completedAt = new Date().toISOString();
		try {
			options.onSettled?.(job);
		} catch {
			// The parent session may already be shutting down; the job stays collectable.
		}
		notify();
		settle(job);
	};
	options
		.run(controller.signal, (calls) => {
			job.status = "running";
			job.toolCalls = calls;
			notify();
		})
		.then((result) => {
			job.result = result;
			finish("completed");
		})
		.catch((error: unknown) => {
			job.error = error instanceof Error ? error.message : String(error);
			finish(controller.signal.aborted ? "cancelled" : "failed");
		});
	return job;
}

export function getBackgroundSubagent(
	id: string,
): BackgroundSubagentJob | undefined {
	return jobs.get(id);
}

export function listBackgroundSubagents(
	parentSessionId?: string,
): BackgroundSubagentJob[] {
	return Array.from(jobs.values()).filter(
		(job) => !parentSessionId || job.parentSessionId === parentSessionId,
	);
}

export function cancelBackgroundSubagent(id: string): boolean {
	const job = jobs.get(id);
	if (!job || !isBackgroundJobActive(job)) return false;
	job.controller.abort();
	return true;
}

export function cancelBackgroundSubagentsForSession(parentSessionId: string): void {
	for (const job of jobs.values())
		if (job.parentSessionId === parentSessionId && isBackgroundJobActive(job))
			job.controller.abort();
}

export function removeSettledBackgroundSubagents(parentSessionId?: string): number {
	let removed = 0;
	for (const job of Array.from(jobs.values())) {
		if (isBackgroundJobActive(job)) continue;
		if (parentSessionId && job.parentSessionId !== parentSessionId) continue;
		jobs.delete(job.id);
		removed += 1;
	}
	if (removed > 0) notify();
	return removed;
}

export type WaitMode = "wait_any" | "wait_all";

/**
 * Resolve when the first (`wait_any`) or every (`wait_all`) listed job has
 * settled, or when the timeout elapses / the signal aborts. Never throws for
 * timeouts; the caller inspects `timedOut`.
 */
export async function waitForBackgroundSubagents(options: {
	ids: string[];
	mode: WaitMode;
	timeoutMs: number;
	signal?: AbortSignal;
}): Promise<{ jobs: BackgroundSubagentJob[]; timedOut: boolean }> {
	const selected = options.ids.map((id) => {
		const job = jobs.get(id);
		if (!job) throw new Error(`未找到后台子 Agent: ${id}`);
		return job;
	});
	const pending = selected.filter(isBackgroundJobActive).map((job) => job.settled);
	const needed =
		options.mode === "wait_any"
			? selected.length > 0 && pending.length === selected.length
				? Promise.any(pending)
				: Promise.resolve()
			: Promise.all(pending);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let onAbort: (() => void) | undefined;
	const timeout = new Promise<"timeout">((resolve) => {
		timer = setTimeout(() => resolve("timeout"), options.timeoutMs);
		onAbort = () => resolve("timeout");
		options.signal?.addEventListener("abort", onAbort, { once: true });
	});
	try {
		const outcome = await Promise.race([needed.then(() => "done" as const), timeout]);
		return { jobs: selected, timedOut: outcome === "timeout" };
	} finally {
		if (timer) clearTimeout(timer);
		if (onAbort) options.signal?.removeEventListener("abort", onAbort);
	}
}
