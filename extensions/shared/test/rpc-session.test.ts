import assert from "node:assert/strict";
import test from "node:test";
import {
	getLiveSubagent,
	setLiveSubagentIdleTimeout,
	setSubagentFollowupGuard,
} from "../subagent/registry.ts";
import { delay, harness, tick } from "./rpc-session-harness.ts";

test("reuses one RPC child with FIFO, per-turn results", async () => {
	const app = await harness("fifo-agent");
	try {
		const firstPromise = app.start("one");
		app.settle("first", true);
		const first = await firstPromise;
		assert.equal(first.turn, 1);
		assert.equal(first.toolCalls.length, 1);

		const run = getLiveSubagent("fifo-agent");
		assert.ok(run);
		const secondPromise = run.request("two");
		const thirdPromise = run.request("three");
		await tick();
		assert.deepEqual(app.prompts, ["one", "two"]);

		app.settle("second");
		const second = await secondPromise;
		assert.equal(second.output, "second");
		assert.equal(second.toolCalls.length, 0);
		await tick();
		assert.deepEqual(app.prompts, ["one", "two", "three"]);

		app.settle("third");
		const third = await thirdPromise;
		assert.equal(third.turn, 3);
		assert.equal(run.turnCount, 3);
		assert.equal(run.entries.filter((entry) => entry.kind === "user").length, 3);
	} finally {
		await app.cleanup();
	}
});

test("idle retention resets around each follow-up", async () => {
	const app = await harness("idle-agent");
	try {
		const first = app.start("one");
		app.settle("first");
		await first;
		const run = getLiveSubagent("idle-agent");
		assert.ok(run);
		assert.equal(setLiveSubagentIdleTimeout(run.id, 30), true);
		assert.ok(run.idleDeadlineAt);
		await delay(10);
		const followup = run.request("two");
		await tick();
		assert.equal(run.idleDeadlineAt, undefined);
		await delay(40);
		assert.equal(app.child.stdin.writableEnded, false);
		app.settle("second");
		await followup;
		assert.ok(run.idleDeadlineAt);
		await delay(50);
		assert.equal(app.child.stdin.writableEnded, true);
	} finally {
		await app.cleanup();
	}
});

test("cancelling a queued follow-up does not abort the active turn", async () => {
	const app = await harness("cancel-agent");
	try {
		const first = app.start("one");
		app.settle("first");
		await first;
		const run = getLiveSubagent("cancel-agent");
		assert.ok(run);
		const active = run.request("two");
		const controller = new AbortController();
		const queued = run.request("three", { signal: controller.signal });
		controller.abort();
		await assert.rejects(queued, /取消/);
		await tick();
		assert.deepEqual(app.prompts, ["one", "two"]);
		app.settle("second");
		assert.equal((await active).output, "second");
	} finally {
		await app.cleanup();
	}
});

test("an aborted active follow-up ignores late updates and stays reusable", async () => {
	const app = await harness("active-abort-agent", {
		abortSettleTimeoutMs: 30,
	});
	try {
		const first = app.start("one");
		app.settle("first");
		await first;
		const run = getLiveSubagent("active-abort-agent");
		assert.ok(run);
		const controller = new AbortController();
		let updates = 0;
		const active = run.request("two", {
			signal: controller.signal,
			onUpdate: () => updates++,
		});
		await tick();
		controller.abort();
		await assert.rejects(active, /取消/);
		const updatesAfterAbort = updates;
		app.settle("ignored");
		await delay(40);
		assert.equal(updates, updatesAfterAbort);
		assert.equal(app.child.stdin.writableEnded, false);
		const next = run.request("three");
		await tick();
		app.settle("third");
		assert.equal((await next).output, "third");
	} finally {
		await app.cleanup();
	}
});

test("abort watchdog disposes a child that never settles", async (context) => {
	context.mock.timers.enable({ apis: ["setTimeout"] });
	const app = await harness("stuck-abort-agent", {
		abortSettleTimeoutMs: 20,
	});
	try {
		const first = app.start("one");
		app.settle("first");
		await first;
		const run = getLiveSubagent("stuck-abort-agent");
		assert.ok(run);
		let releases = 0;
		setSubagentFollowupGuard(run.id, () => () => releases++);
		const controller = new AbortController();
		const active = run.request("two", { signal: controller.signal });
		await tick();
		const queued = run.request("three");
		const queuedRejected = assert.rejects(queued, /取消后未结束/);
		controller.abort();
		await assert.rejects(active, /取消/);
		context.mock.timers.tick(20);
		await queuedRejected;
		assert.equal(app.child.stdin.writableEnded, true);
		assert.equal(releases, 1);
		assert.deepEqual(app.prompts, ["one", "two"]);
	} finally {
		await app.cleanup();
	}
});

test("one-shot RPC children reject follow-ups", async () => {
	const app = await harness("one-shot-agent", { keepOpen: false });
	try {
		const first = app.start("one");
		app.settle("first");
		const result = await first;
		assert.equal(result.reusable, false);
		const run = getLiveSubagent("one-shot-agent");
		assert.ok(run);
		await assert.rejects(run.request("two"), /一次性模式/);
	} finally {
		await app.cleanup();
	}
});

test("process close during an async guard releases the acquired lock", async () => {
	const app = await harness("close-agent");
	try {
		const first = app.start("one");
		app.settle("first");
		await first;
		const run = getLiveSubagent("close-agent");
		assert.ok(run);
		let allowGuard!: () => void;
		let releases = 0;
		setSubagentFollowupGuard(
			run.id,
			() =>
				new Promise((resolve) => {
					allowGuard = () => resolve(() => releases++);
				}),
		);
		const followup = run.request("two");
		await tick();
		app.child.close(1);
		allowGuard();
		await assert.rejects(followup, /退出/);
		await tick();
		assert.deepEqual(app.prompts, ["one"]);
		assert.equal(releases, 1);
		assert.equal(getLiveSubagent(run.id), undefined);
	} finally {
		await app.cleanup();
	}
});
