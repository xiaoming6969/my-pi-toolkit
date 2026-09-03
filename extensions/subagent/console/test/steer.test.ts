import assert from "node:assert/strict";
import test from "node:test";
import type { LiveSubagentRun } from "../../../shared/subagent/registry.ts";
import { deliverSubagentMessage } from "../steer.ts";

function fakeRun(overrides: Partial<LiveSubagentRun>) {
	const calls: string[] = [];
	const run: LiveSubagentRun = {
		id: "steer",
		title: "t",
		model: "m",
		cwd: "/",
		status: "running",
		startedAt: "2026-01-01T00:00:00.000Z",
		parentSessionId: "s1",
		reusable: true,
		turnCount: 1,
		lines: [],
		entries: [],
		request: async (message) => {
			calls.push(`request:${message}`);
			throw new Error("rejected later");
		},
		steer: (message) => calls.push(`steer:${message}`),
		abort() {},
		dispose() {},
		subscribe: () => () => {},
		...overrides,
	};
	return { run, calls };
}

test("running children are steered mid-turn", () => {
	const { run, calls } = fakeRun({});
	assert.equal(deliverSubagentMessage(run, "  focus on tests ", "s1"), "steered");
	assert.deepEqual(calls, ["steer:focus on tests"]);
});

test("idle reusable children get a queued turn; steer failures fall back too", () => {
	const idle = fakeRun({ status: "completed" });
	assert.equal(deliverSubagentMessage(idle.run, "next", "s1"), "queued");
	assert.deepEqual(idle.calls, ["request:next"]);

	const flaky = fakeRun({
		steer: () => {
			throw new Error("turn just finished");
		},
	});
	assert.equal(deliverSubagentMessage(flaky.run, "msg", "s1"), "queued");
	assert.deepEqual(flaky.calls, ["request:msg"]);

	const noSteer = fakeRun({ steer: undefined });
	assert.equal(deliverSubagentMessage(noSteer.run, "msg", "s1"), "queued");
});

test("empty messages, foreign sessions and one-shot children are rejected", () => {
	const { run, calls } = fakeRun({});
	assert.equal(deliverSubagentMessage(run, "   ", "s1"), "rejected");
	assert.equal(deliverSubagentMessage(run, "hi", "other"), "rejected");
	const oneShot = fakeRun({ status: "completed", reusable: false });
	assert.equal(deliverSubagentMessage(oneShot.run, "hi", "s1"), "rejected");
	assert.deepEqual(calls, []);
});
