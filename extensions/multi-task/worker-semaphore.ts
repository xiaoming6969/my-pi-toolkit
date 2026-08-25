const GLOBAL_WORKER_LIMIT = 6;
const STATE_KEY = Symbol.for("my-pi-toolkit.multi-task-worker-semaphore");

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

function drain(): void {
	while (state.active < GLOBAL_WORKER_LIMIT && state.waiters.length > 0) {
		const waiter = state.waiters.shift();
		if (!waiter) return;
		waiter.signal.removeEventListener("abort", waiter.onAbort);
		if (waiter.signal.aborted) {
			waiter.reject(new Error("Multi Task worker 已取消"));
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

export function acquireWorkerSlot(signal: AbortSignal): Promise<() => void> {
	if (signal.aborted)
		return Promise.reject(new Error("Multi Task worker 已取消"));
	return new Promise((resolve, reject) => {
		const waiter: Waiter = {
			signal,
			resolve,
			reject,
			onAbort: () => {
				const index = state.waiters.indexOf(waiter);
				if (index < 0) return;
				state.waiters.splice(index, 1);
				reject(new Error("Multi Task worker 已取消"));
			},
		};
		state.waiters.push(waiter);
		signal.addEventListener("abort", waiter.onAbort, { once: true });
		drain();
	});
}
