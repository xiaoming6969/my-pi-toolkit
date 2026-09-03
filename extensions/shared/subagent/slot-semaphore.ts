/**
 * Process-wide cap on concurrently launched subagent children. Every launch
 * path (spawn_subagent, repo_search, tapd_review, Multi Task workers) takes a
 * slot before spawning, so several batches or tools cannot stack past the
 * limit. Waiters are granted in FIFO order.
 */
export const SUBAGENT_SLOT_LIMIT = 6;
const STATE_KEY = Symbol.for("my-pi-toolkit.subagent-slot-semaphore");

type Waiter = {
	signal: AbortSignal;
	resolve: (release: () => void) => void;
	reject: (error: Error) => void;
	onAbort: () => void;
};
type SemaphoreState = { active: number; waiters: Waiter[] };

const globalState = globalThis as Record<PropertyKey, unknown>;
const existing = globalState[STATE_KEY] as SemaphoreState | undefined;
const state = existing ?? { active: 0, waiters: [] };
globalState[STATE_KEY] = state;

const cancelled = () => new Error("子 Agent 槽位等待已取消");

function drain(): void {
	while (state.active < SUBAGENT_SLOT_LIMIT && state.waiters.length > 0) {
		const waiter = state.waiters.shift();
		if (!waiter) return;
		waiter.signal.removeEventListener("abort", waiter.onAbort);
		if (waiter.signal.aborted) {
			waiter.reject(cancelled());
			continue;
		}
		state.active++;
		let released = false;
		waiter.resolve(() => {
			if (released) return;
			released = true;
			state.active--;
			drain();
		});
	}
}

export function subagentSlotUsage(): { active: number; queued: number } {
	return { active: state.active, queued: state.waiters.length };
}

export function acquireSubagentSlot(signal: AbortSignal): Promise<() => void> {
	if (signal.aborted) return Promise.reject(cancelled());
	return new Promise((resolve, reject) => {
		const waiter: Waiter = {
			signal,
			resolve,
			reject,
			onAbort: () => {
				const index = state.waiters.indexOf(waiter);
				if (index < 0) return;
				state.waiters.splice(index, 1);
				reject(cancelled());
			},
		};
		state.waiters.push(waiter);
		signal.addEventListener("abort", waiter.onAbort, { once: true });
		drain();
	});
}
