export type SubagentRunStatus = "starting" | "running" | "completed" | "failed";

export interface SubagentToolCall {
	name: string;
	arguments: Record<string, unknown>;
}

export interface SubagentTurnUpdate {
	status: string;
	toolCalls: SubagentToolCall[];
	subagentId: string;
	reusable: boolean;
	turn: number;
}

export interface SubagentTurnResult {
	output: string;
	model?: string;
	toolCalls: SubagentToolCall[];
	runDir: string;
	subagentId: string;
	reusable: boolean;
	turn: number;
}

export interface SubagentRequestOptions {
	signal?: AbortSignal;
	onUpdate?: (update: SubagentTurnUpdate) => void;
}

export type SubagentFollowupGuard = () =>
	| void
	| (() => void)
	| Promise<void | (() => void)>;

export type SubagentTranscriptEntry =
	| { kind: "user"; text: string }
	| { kind: "assistant"; message: unknown; streaming?: boolean }
	| {
			kind: "tool";
			id: string;
			name: string;
			args: Record<string, unknown>;
			result?: unknown;
			isError?: boolean;
	  };

export interface LiveSubagentRun {
	id: string;
	title: string;
	model: string;
	thinkingLevel?: string;
	cwd: string;
	status: SubagentRunStatus;
	startedAt: string;
	parentSessionId?: string;
	reusable: boolean;
	turnCount: number;
	queuedCount?: number;
	turnStartedAt?: string;
	idleDeadlineAt?: string;
	lines: string[];
	entries: SubagentTranscriptEntry[];
	request(
		message: string,
		options?: SubagentRequestOptions,
	): Promise<SubagentTurnResult>;
	abort(): void;
	dispose(): void;
	subscribe(listener: () => void): () => void;
}

const REGISTRY_KEY = Symbol.for("my-pi-toolkit.live-subagent-runs");
const GUARDS_KEY = Symbol.for("my-pi-toolkit.subagent-followup-guards");
const IDLE_TIMEOUTS_KEY = Symbol.for("my-pi-toolkit.subagent-idle-timeouts");
const globalRegistry = globalThis as Record<PropertyKey, unknown>;
const existingRuns = globalRegistry[REGISTRY_KEY];
const runs =
	existingRuns instanceof Map
		? (existingRuns as Map<string, LiveSubagentRun>)
		: new Map<string, LiveSubagentRun>();
const existingGuards = globalRegistry[GUARDS_KEY];
const guards =
	existingGuards instanceof Map
		? (existingGuards as Map<string, SubagentFollowupGuard>)
		: new Map<string, SubagentFollowupGuard>();
type IdleTimeout = { delayMs: number; timer?: ReturnType<typeof setTimeout> };
const existingIdleTimeouts = globalRegistry[IDLE_TIMEOUTS_KEY];
const idleTimeouts =
	existingIdleTimeouts instanceof Map
		? (existingIdleTimeouts as Map<string, IdleTimeout>)
		: new Map<string, IdleTimeout>();
globalRegistry[REGISTRY_KEY] = runs;
globalRegistry[GUARDS_KEY] = guards;
globalRegistry[IDLE_TIMEOUTS_KEY] = idleTimeouts;
const listeners = new Set<() => void>();

function syncIdleTimeout(run: LiveSubagentRun): void {
	const idle = idleTimeouts.get(run.id);
	if (!idle) return;
	if (idle.timer) clearTimeout(idle.timer);
	idle.timer = undefined;
	run.idleDeadlineAt = undefined;
	if (
		!run.reusable ||
		(run.status !== "completed" && run.status !== "failed")
	)
		return;
	run.idleDeadlineAt = new Date(Date.now() + idle.delayMs).toISOString();
	idle.timer = setTimeout(() => {
		idle.timer = undefined;
		run.idleDeadlineAt = undefined;
		runs.get(run.id)?.dispose();
	}, idle.delayMs);
	idle.timer.unref?.();
}

export function notifySubagentRegistryChanged(run?: LiveSubagentRun): void {
	if (run) syncIdleTimeout(run);
	listeners.forEach((listener) => listener());
}

export function subscribeSubagentRegistry(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function activeSubagentCount(): number {
	return Array.from(runs.values()).filter(
		(run) => run.status === "starting" || run.status === "running",
	).length;
}

export function registerLiveSubagent(run: LiveSubagentRun): void {
	runs.set(run.id, run);
	notifySubagentRegistryChanged(run);
}

export function getLiveSubagent(id: string): LiveSubagentRun | undefined {
	return runs.get(id);
}

export function setLiveSubagentIdleTimeout(
	id: string,
	delayMs: number,
): boolean {
	const run = runs.get(id);
	if (!run) return false;
	const previous = idleTimeouts.get(id);
	if (previous?.timer) clearTimeout(previous.timer);
	idleTimeouts.set(id, { delayMs });
	syncIdleTimeout(run);
	return true;
}

export function setSubagentFollowupGuard(
	id: string,
	guard: SubagentFollowupGuard,
): boolean {
	if (!runs.has(id)) return false;
	guards.set(id, guard);
	return true;
}

export async function acquireSubagentFollowup(
	id: string,
): Promise<() => void> {
	const release = await guards.get(id)?.();
	return typeof release === "function" ? release : () => {};
}

export function removeLiveSubagent(id: string): void {
	guards.delete(id);
	const idle = idleTimeouts.get(id);
	if (idle?.timer) clearTimeout(idle.timer);
	idleTimeouts.delete(id);
	if (runs.delete(id)) notifySubagentRegistryChanged();
}

export function listLiveSubagents(): LiveSubagentRun[] {
	return Array.from(runs.values()).sort((left, right) =>
		right.startedAt.localeCompare(left.startedAt),
	);
}

export function abortAllLiveSubagents(): void {
	runs.forEach((run) => run.dispose());
	guards.clear();
	idleTimeouts.forEach((idle) => {
		if (idle.timer) clearTimeout(idle.timer);
	});
	idleTimeouts.clear();
	if (runs.size === 0) return;
	runs.clear();
	notifySubagentRegistryChanged();
}

export function waitForLiveSubagent(
	match: (run: LiveSubagentRun) => boolean,
	signal?: AbortSignal,
): Promise<LiveSubagentRun> {
	const existing = listLiveSubagents().find(match);
	if (existing) return Promise.resolve(existing);
	return new Promise((resolve, reject) => {
		let unsubscribe = () => {};
		const finish = (error?: Error, run?: LiveSubagentRun) => {
			signal?.removeEventListener("abort", onAbort);
			unsubscribe();
			if (error) reject(error);
			else if (run) resolve(run);
		};
		const onAbort = () => finish(new Error("子 Agent 已取消"));
		if (signal?.aborted) {
			onAbort();
			return;
		}
		signal?.addEventListener("abort", onAbort, { once: true });
		unsubscribe = subscribeSubagentRegistry(() => {
			const found = listLiveSubagents().find(match);
			if (found) finish(undefined, found);
		});
	});
}
