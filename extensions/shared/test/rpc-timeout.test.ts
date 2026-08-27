import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
	getLiveSubagent,
	setSubagentFollowupGuard,
} from "../subagent/registry.ts";
import { RPC_TURN_TIMEOUT_MS } from "../subagent/rpc-session.ts";
import { harness, tick } from "./rpc-session-harness.ts";

function mockTimeouts(context: TestContext): void {
	context.mock.timers.enable({ apis: ["setTimeout"] });
}

test("normal settled turns clear the hard timeout", async (context) => {
	mockTimeouts(context);
	const app = await harness("normal-timeout-agent");
	try {
		const first = app.start("one");
		app.settle("first");
		await first;
		context.mock.timers.tick(RPC_TURN_TIMEOUT_MS + 1);
		assert.equal(app.abortCount, 0);

		const run = getLiveSubagent("normal-timeout-agent");
		assert.ok(run);
		const followup = run.request("two");
		await tick();
		app.settle("second");
		await followup;
		context.mock.timers.tick(RPC_TURN_TIMEOUT_MS + 1);
		assert.equal(app.abortCount, 0);
	} finally {
		await app.cleanup();
	}
});

test("timeout aborts, rejects queued turns, and releases the guard on settled", async (context) => {
	mockTimeouts(context);
	const app = await harness("settled-timeout-agent");
	try {
		const first = app.start("one");
		app.settle("first");
		await first;
		const run = getLiveSubagent("settled-timeout-agent");
		assert.ok(run);
		let releases = 0;
		setSubagentFollowupGuard(run.id, () => () => releases++);
		const active = run.request("two");
		await tick();
		const queued = run.request("three");
		const queuedRejected = assert.rejects(queued, /30 分钟/);

		context.mock.timers.tick(RPC_TURN_TIMEOUT_MS);
		await queuedRejected;
		assert.equal(app.abortCount, 1);
		assert.equal(releases, 0);
		assert.deepEqual(app.prompts, ["one", "two"]);
		assert.equal(run.status, "failed");
		app.emitEvent({ type: "agent_start" });
		assert.equal(run.status, "failed");

		app.settle("ignored");
		await assert.rejects(active, /30 分钟/);
		assert.equal(releases, 1);
		context.mock.timers.tick(5_001);
		assert.equal(app.child.stdin.writableEnded, false);
	} finally {
		await app.cleanup();
	}
});

test("timeout disposes after the existing settle watchdog", async (context) => {
	mockTimeouts(context);
	const app = await harness("stuck-timeout-agent");
	try {
		const first = app.start("one");
		app.settle("first");
		await first;
		const run = getLiveSubagent("stuck-timeout-agent");
		assert.ok(run);
		let releases = 0;
		setSubagentFollowupGuard(run.id, () => () => releases++);
		const active = run.request("two");
		await tick();

		context.mock.timers.tick(RPC_TURN_TIMEOUT_MS);
		assert.equal(app.abortCount, 1);
		assert.equal(releases, 0);
		context.mock.timers.tick(5_000);
		await assert.rejects(active, /abort 后 5 秒未结束/);
		assert.equal(app.child.stdin.writableEnded, true);
		assert.equal(releases, 1);
	} finally {
		await app.cleanup();
	}
});

test("hard timeout starts only after the follow-up guard releases", async (context) => {
	mockTimeouts(context);
	const app = await harness("guard-timeout-agent");
	try {
		const first = app.start("one");
		app.settle("first");
		await first;
		const run = getLiveSubagent("guard-timeout-agent");
		assert.ok(run);
		let allowGuard!: () => void;
		setSubagentFollowupGuard(
			run.id,
			() =>
				new Promise((resolve) => {
					allowGuard = () => resolve();
				}),
		);
		const followup = run.request("two");
		await tick();
		context.mock.timers.tick(RPC_TURN_TIMEOUT_MS);
		assert.equal(app.abortCount, 0);
		assert.deepEqual(app.prompts, ["one"]);

		allowGuard();
		await tick();
		assert.deepEqual(app.prompts, ["one", "two"]);
		context.mock.timers.tick(RPC_TURN_TIMEOUT_MS);
		assert.equal(app.abortCount, 1);
		app.settle("ignored");
		await assert.rejects(followup, /30 分钟/);
	} finally {
		await app.cleanup();
	}
});
