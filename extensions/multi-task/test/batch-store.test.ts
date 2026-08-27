import assert from "node:assert/strict";
import test from "node:test";

const KEY = Symbol.for("my-pi-toolkit.multi-task-batches");

test("rehydrates persisted batches and fills worker defaults", async () => {
	(
		globalThis as typeof globalThis & {
			[KEY]?: Map<string, { model: string; workers: Array<Record<string, unknown>> }>;
		}
	)[KEY] = new Map([
		[
			"b1",
			{
				model: "openai/gpt",
				workers: [{ id: "w1" }],
			},
		],
	]);
	const { batches } = await import(`../batch-store.ts?rehydrate=${Date.now()}`);
	const batch = batches.get("b1") as {
		keepOpen: boolean;
		model: string;
		workers: Array<{ toolCalls: unknown[]; kind: string; model: string }>;
	};
	assert.equal(batch.keepOpen, false);
	assert.deepEqual(batch.workers[0]?.toolCalls, []);
	assert.equal(batch.workers[0]?.kind, "implementation");
	assert.equal(batch.workers[0]?.model, "openai/gpt");
});
