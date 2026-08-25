import type { MultiTaskBatch } from "./types.js";

const PROGRESS_DEBOUNCE_MS = 150;

export interface ProgressEmitter {
	emit(): void;
	flush(): void;
}

function progressKey(batch: MultiTaskBatch): string {
	return batch.workers
		.map((worker) => {
			const lastCall = worker.toolCalls.slice(-1)[0];
			return [
				worker.id,
				worker.status,
				worker.progress ?? "",
				worker.toolCalls.length,
				lastCall?.name ?? "",
			].join(":");
		})
		.join("|");
}

export function createProgressEmitter(
	batch: MultiTaskBatch,
	onProgress: ((batch: MultiTaskBatch) => void) | undefined,
): ProgressEmitter {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let lastKey: string | undefined;
	let pending = false;

	const flush = () => {
		pending = false;
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
		if (!onProgress) return;
		const key = progressKey(batch);
		if (key === lastKey) return;
		lastKey = key;
		try {
			onProgress(batch);
		} catch {
			// UI progress must never interrupt worker execution.
		}
	};

	return {
		emit() {
			if (!onProgress) return;
			pending = true;
			if (timer !== undefined) return;
			timer = setTimeout(() => {
				timer = undefined;
				if (pending) flush();
			}, PROGRESS_DEBOUNCE_MS);
		},
		flush,
	};
}
