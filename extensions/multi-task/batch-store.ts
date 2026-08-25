import type { MultiTaskBatch } from "./types.js";

const BATCHES_KEY = Symbol.for("my-pi-toolkit.multi-task-batches");
const globalState = globalThis as Record<PropertyKey, unknown>;
const existing = globalState[BATCHES_KEY];

export const batches =
	existing instanceof Map
		? (existing as Map<string, MultiTaskBatch>)
		: new Map<string, MultiTaskBatch>();

globalState[BATCHES_KEY] = batches;
batches.forEach((batch) => {
	batch.keepOpen ??= false;
	batch.workers.forEach((worker) => {
		worker.toolCalls ??= [];
		worker.kind ??= "implementation";
		worker.model ??= batch.model;
	});
});
