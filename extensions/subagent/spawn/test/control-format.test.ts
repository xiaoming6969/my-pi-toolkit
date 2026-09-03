import assert from "node:assert/strict";
import test from "node:test";
import { startBackgroundSubagent } from "../../../shared/subagent/background.ts";
import {
	registerLiveSubagent,
	removeLiveSubagent,
	type LiveSubagentRun,
} from "../../../shared/subagent/registry.ts";
import type { SubagentRunResult } from "../../../shared/subagent/run.ts";
import {
	describeSubagentOutput,
	jobStatusLine,
	jobStatusView,
} from "../control-format.ts";

const result = (output: string, reusable = false): SubagentRunResult => ({
	output,
	model: "m",
	toolCalls: [],
	subagentId: "child-1",
	reusable,
	turn: 2,
	exitCode: 0,
	stderr: "",
});

let counter = 0;
const nextId = () => `cf-${process.pid}-${++counter}`;

function fakeRun(overrides: Partial<LiveSubagentRun>): LiveSubagentRun {
	return {
		id: "live-run",
		title: "review · api",
		model: "m",
		cwd: process.cwd(),
		status: "running",
		startedAt: "2026-01-01T00:00:00.000Z",
		parentSessionId: "s1",
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

test("completed background jobs return the truncated report and reusable handle", async () => {
	const job = startBackgroundSubagent({
		id: nextId(),
		title: "explore · demo",
		parentSessionId: "s1",
		run: async () => result("Report body", true),
	});
	await job.settled;
	const view = describeSubagentOutput(` ${job.id} `, "s1");
	assert.equal(view.status, "completed");
	assert.match(view.text, /^Report body\n\nReusable subagentId: child-1 \(turn 2\)\.$/);
	assert.equal(view.output, "Report body");
	assert.equal(view.truncated, false);
	assert.equal(jobStatusLine(job), `- ${job.id} (explore · demo): completed`);
	assert.deepEqual(jobStatusView(job), {
		subagentId: job.id,
		title: "explore · demo",
		status: "completed",
		error: undefined,
	});
	assert.throws(() => describeSubagentOutput(job.id, "other"), /其他主会话/);
});

test("failed and running background jobs describe their state", async () => {
	const failed = startBackgroundSubagent({
		id: nextId(),
		title: "plan · x",
		parentSessionId: "s1",
		run: async () => {
			throw new Error("model unavailable");
		},
	});
	await failed.settled;
	assert.equal(
		describeSubagentOutput(failed.id, "s1").text,
		"plan · x failed: model unavailable",
	);
	assert.equal(jobStatusLine(failed), `- ${failed.id} (plan · x): failed — model unavailable`);

	const running = startBackgroundSubagent({
		id: nextId(),
		title: "implement · y",
		parentSessionId: "s1",
		run: (_signal, onToolCalls) => {
			onToolCalls([{ name: "edit", arguments: { path: "src/a.ts" } }]);
			return new Promise(() => {});
		},
	});
	await new Promise((resolve) => setImmediate(resolve));
	const view = describeSubagentOutput(running.id, "s1");
	assert.equal(view.status, "running");
	assert.match(view.text, /no report yet/);
	assert.match(view.text, /→ edit src\/a\.ts/);
	running.controller.abort();
});

test("live registry runs report progress or the latest assistant text", () => {
	const run = fakeRun({
		id: `live-${process.pid}`,
		entries: [
			{ kind: "user", text: "task" },
			{
				kind: "assistant",
				message: { role: "assistant", content: [{ type: "text", text: "Working…" }] },
			},
		],
	});
	registerLiveSubagent(run);
	try {
		const active = describeSubagentOutput(run.id, "s1");
		assert.match(active.text, /is running \(turn 1\)/);
		assert.match(active.text, /Latest assistant text:\nWorking…/);
		run.status = "completed";
		assert.equal(describeSubagentOutput(run.id, "s1").text, "Working…");
		run.entries = [];
		assert.match(describeSubagentOutput(run.id, "s1").text, /no assistant output yet/);
		assert.throws(() => describeSubagentOutput(run.id, "s2"), /其他主会话/);
	} finally {
		removeLiveSubagent(run.id);
	}
	assert.throws(() => describeSubagentOutput("ghost", "s1"), /未找到子 Agent/);
	assert.throws(() => describeSubagentOutput("  ", "s1"), /不能为空/);
});
