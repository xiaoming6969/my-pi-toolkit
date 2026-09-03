import assert from "node:assert/strict";
import test from "node:test";
import { formatTaskDuration } from "../index.ts";
import { SubagentTimeTracker } from "../subagent-time.ts";

test("tracks wall-clock time with at least one subagent active without double counting", () => {
	let now = 0;
	let active = 0;
	let listener: (() => void) | undefined;
	let unsubscribed = false;
	const tracker = new SubagentTimeTracker(
		() => now,
		() => active,
		(fn) => {
			listener = fn;
			return () => {
				unsubscribed = true;
			};
		},
	);
	tracker.reset();
	assert.deepEqual(tracker.snapshot(), { subagentMs: 0, peakSubagents: 0 });

	now = 100;
	active = 1;
	listener?.();
	now = 200;
	active = 3;
	listener?.();
	now = 400;
	assert.deepEqual(tracker.snapshot(), { subagentMs: 300, peakSubagents: 3 });
	active = 0;
	listener?.();
	now = 900;
	assert.deepEqual(tracker.snapshot(), { subagentMs: 300, peakSubagents: 3 });

	active = 1;
	listener?.();
	now = 1_000;
	active = 0;
	listener?.();
	assert.deepEqual(tracker.snapshot(), { subagentMs: 400, peakSubagents: 3 });

	active = 2;
	tracker.reset();
	now = 1_050;
	assert.deepEqual(tracker.snapshot(), { subagentMs: 50, peakSubagents: 2 });
	tracker.dispose();
	assert.equal(unsubscribed, true);
});

test("formatTaskDuration appends subagent time and parallelism only when present", () => {
	assert.equal(formatTaskDuration(undefined), "本次任务耗时 0s");
	assert.equal(
		formatTaskDuration({ durationMs: 2_000, completedAt: 0, subagentMs: 0 }),
		"本次任务耗时 2s",
	);
	assert.equal(
		formatTaskDuration({ durationMs: 65_000, completedAt: 0, subagentMs: 30_000, peakSubagents: 1 }),
		"本次任务耗时 1m 05s · 子 Agent 运行 30s",
	);
	assert.equal(
		formatTaskDuration({ durationMs: 65_000, completedAt: 0, subagentMs: 30_000, peakSubagents: 3 }),
		"本次任务耗时 1m 05s · 子 Agent 运行 30s，峰值 3 个并行",
	);
});
