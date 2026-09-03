import assert from "node:assert/strict";
import test from "node:test";
import type { BackgroundSubagentJob } from "../../../shared/subagent/background.ts";
import type { LiveSubagentRun } from "../../../shared/subagent/registry.ts";
import {
	countSubagentGroups,
	formatSubagentFooterStatus,
} from "../footer-status.ts";

const run = (overrides: Partial<LiveSubagentRun>): LiveSubagentRun =>
	({
		id: "r",
		title: "t",
		model: "m",
		cwd: "/",
		status: "running",
		startedAt: "2026-01-01T00:00:00.000Z",
		reusable: true,
		turnCount: 1,
		lines: [],
		entries: [],
		request: async () => {
			throw new Error("unused");
		},
		abort() {},
		dispose() {},
		subscribe: () => () => {},
		...overrides,
	}) as LiveSubagentRun;

const job = (overrides: Partial<BackgroundSubagentJob>): BackgroundSubagentJob =>
	({
		id: "j",
		title: "t",
		parentSessionId: "s",
		status: "queued",
		startedAt: "2026-01-01T00:00:00.000Z",
		toolCalls: [],
		controller: new AbortController(),
		settled: Promise.resolve({} as BackgroundSubagentJob),
		...overrides,
	}) as BackgroundSubagentJob;

test("groups live runs and background jobs into running / queued / idle", () => {
	const counts = countSubagentGroups(
		[
			run({ id: "a", status: "running", queuedCount: 2 }),
			run({ id: "b", status: "starting" }),
			run({ id: "c", status: "completed", reusable: true }),
			run({ id: "d", status: "completed", reusable: false }),
			run({ id: "e", status: "failed", reusable: true }),
		],
		[
			job({ id: "q1", status: "queued" }),
			job({ id: "b", status: "running" }),
			job({ id: "x", status: "running" }),
			job({ id: "done", status: "completed" }),
		],
	);
	assert.deepEqual(counts, { running: 3, queued: 3, idle: 2 });
});

test("footer text lists non-zero groups only and hides when empty", () => {
	assert.equal(
		formatSubagentFooterStatus({ running: 2, queued: 1, idle: 1 }),
		"subagent 2 run · 1 queued · 1 idle",
	);
	assert.equal(formatSubagentFooterStatus({ running: 0, queued: 0, idle: 3 }), "subagent 3 idle");
	assert.equal(formatSubagentFooterStatus({ running: 0, queued: 0, idle: 0 }), undefined);
});
