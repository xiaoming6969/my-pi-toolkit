import assert from "node:assert/strict";
import test from "node:test";
import {
	registerLiveSubagent,
	removeLiveSubagent,
	type LiveSubagentRun,
} from "../shared/subagent/registry.ts";
import { resolveFollowupRun } from "./followup-tool.ts";

function fakeRun(overrides: Partial<LiveSubagentRun> = {}): LiveSubagentRun {
	return {
		id: "followup-agent",
		title: "test",
		model: "test/model",
		cwd: process.cwd(),
		status: "completed",
		startedAt: new Date().toISOString(),
		parentSessionId: "parent-1",
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
	};
}

test("resolves only an exact reusable child from the current parent session", () => {
	const run = fakeRun();
	registerLiveSubagent(run);
	try {
		assert.equal(resolveFollowupRun(run.id, "parent-1"), run);
		assert.throws(
			() => resolveFollowupRun(run.id, "parent-2"),
			/其他主会话/,
		);
		assert.throws(
			() => resolveFollowupRun("missing", "parent-1"),
			/未找到/,
		);
	} finally {
		removeLiveSubagent(run.id);
	}
});

test("rejects a live child explicitly configured as one-shot", () => {
	const run = fakeRun({ id: "one-shot-agent", reusable: false });
	registerLiveSubagent(run);
	try {
		assert.throws(
			() => resolveFollowupRun(run.id, "parent-1"),
			/一次性模式/,
		);
	} finally {
		removeLiveSubagent(run.id);
	}
});
