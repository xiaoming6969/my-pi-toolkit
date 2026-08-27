import assert from "node:assert/strict";
import test from "node:test";
import { createProgressEmitter } from "../progress.ts";
import type { MultiTaskBatch } from "../types.ts";

function batch(
	overrides: Partial<MultiTaskBatch["workers"][number]> = {},
): MultiTaskBatch {
	return {
		id: "b1",
		cwd: "/repo",
		model: "m",
		parentSessionId: "s1",
		status: "running",
		createdAt: "t",
		maxConcurrency: 1,
		implementationTools: [],
		keepOpen: false,
		cancelRequested: false,
		workers: [
			{
				id: "w1",
				task: "work",
				paths: ["src"],
				kind: "implementation",
				model: "m",
				status: "running",
				toolCalls: [],
				controller: new AbortController(),
				...overrides,
			},
		],
	};
}

test("createProgressEmitter no-ops without a listener", () => {
	const emitter = createProgressEmitter(batch(), undefined);
	emitter.emit();
	emitter.flush();
});

test("createProgressEmitter debounces identical snapshots and ignores listener errors", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const current = batch();
	const seen: string[] = [];
	const emitter = createProgressEmitter(current, (value) => {
		seen.push(value.workers[0]?.status ?? "");
		if (seen.length === 1) throw new Error("ui blew up");
	});

	emitter.emit();
	emitter.emit();
	t.mock.timers.tick(150);
	assert.deepEqual(seen, ["running"]);

	emitter.flush();
	assert.deepEqual(seen, ["running"]);

	current.workers[0]!.status = "completed";
	current.workers[0]!.progress = "done";
	current.workers[0]!.toolCalls = [{ name: "read", arguments: { path: "a.ts" } }];
	emitter.flush();
	assert.deepEqual(seen, ["running", "completed"]);
});
