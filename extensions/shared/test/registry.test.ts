import assert from "node:assert/strict";
import test from "node:test";
import {
	abortAllLiveSubagents,
	acquireSubagentFollowup,
	activeSubagentCount,
	getLiveSubagent,
	listLiveSubagents,
	registerLiveSubagent,
	removeLiveSubagent,
	setLiveSubagentIdleTimeout,
	setSubagentFollowupGuard,
	subscribeSubagentRegistry,
	notifySubagentRegistryChanged,
	waitForLiveSubagent,
	type LiveSubagentRun,
} from "../subagent/registry.ts";

function fakeRun(overrides: Partial<LiveSubagentRun> = {}): LiveSubagentRun {
	return {
		id: "reg-agent",
		title: "test",
		model: "test/model",
		cwd: process.cwd(),
		status: "completed",
		startedAt: "2026-01-01T00:00:00.000Z",
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

test("registry tracks live children, follow-up guards, and abort-all", async () => {
	const older = fakeRun({
		id: "older",
		startedAt: "2026-01-01T00:00:00.000Z",
		status: "running",
	});
	const newer = fakeRun({
		id: "newer",
		startedAt: "2026-01-01T01:00:00.000Z",
	});
	registerLiveSubagent(older);
	registerLiveSubagent(newer);
	try {
		assert.equal(activeSubagentCount(), 1);
		assert.equal(listLiveSubagents()[0]?.id, "newer");
		assert.equal(setSubagentFollowupGuard("missing", () => {}), false);
		assert.equal(setSubagentFollowupGuard(newer.id, async () => () => {}), true);
		const release = await acquireSubagentFollowup(newer.id);
		release();
	assert.equal(await acquireSubagentFollowup("missing").then((fn) => typeof fn), "function");

		let notifications = 0;
		const stop = subscribeSubagentRegistry(() => {
			notifications += 1;
		});
		removeLiveSubagent(older.id);
		assert.equal(getLiveSubagent(older.id), undefined);
		assert.ok(notifications >= 1);
		stop();
	} finally {
		abortAllLiveSubagents();
		assert.equal(listLiveSubagents().length, 0);
	}
});

test("waitForLiveSubagent resolves existing matches and honors abort", async () => {
	const run = fakeRun({ id: "wait-existing" });
	registerLiveSubagent(run);
	try {
		assert.equal(await waitForLiveSubagent((item) => item.id === run.id), run);
		const aborted = new AbortController();
		aborted.abort();
		await assert.rejects(
			() => waitForLiveSubagent(() => false, aborted.signal),
			/已取消/,
		);
	} finally {
		removeLiveSubagent(run.id);
	}

	const pending = waitForLiveSubagent((item) => item.id === "wait-later");
	registerLiveSubagent(fakeRun({ id: "wait-later" }));
	try {
		assert.equal((await pending).id, "wait-later");
	} finally {
		removeLiveSubagent("wait-later");
	}
});

test("idle timeout is ignored for missing or non-reusable children", () => {
	assert.equal(setLiveSubagentIdleTimeout("missing", 10), false);
	const run = fakeRun({ id: "one-shot", reusable: false, status: "completed" });
	registerLiveSubagent(run);
	try {
		assert.equal(setLiveSubagentIdleTimeout(run.id, 10), true);
		assert.equal(run.idleDeadlineAt, undefined);
	} finally {
		removeLiveSubagent(run.id);
	}
});

test("idle timeout disposes reusable completed children", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let disposed = 0;
	const run = fakeRun({
		id: "idle-me",
		reusable: true,
		status: "completed",
		dispose() {
			disposed += 1;
		},
	});
	registerLiveSubagent(run);
	try {
		assert.equal(setLiveSubagentIdleTimeout(run.id, 10), true);
		assert.ok(run.idleDeadlineAt);
		assert.equal(setLiveSubagentIdleTimeout(run.id, 20), true);
		notifySubagentRegistryChanged(run);
		notifySubagentRegistryChanged();
		t.mock.timers.tick(20);
		assert.equal(disposed, 1);
	} finally {
		removeLiveSubagent(run.id);
	}
});

test("abortAllLiveSubagents is a no-op without live children", () => {
	abortAllLiveSubagents();
	assert.equal(listLiveSubagents().length, 0);
});

