import assert from "node:assert/strict";
import test from "node:test";
import {
	emitRpcTurnUpdate,
	RpcTurnQueue,
} from "../subagent/rpc-turn-queue.ts";

test("RpcTurnQueue covers activate, cancel, and complete paths", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const queue = new RpcTurnQueue();
	assert.equal(queue.activateNext(), undefined);
	assert.equal(queue.queuedCount, 0);

	const first = queue.enqueue({ task: "one", initial: true });
	const second = queue.enqueue({
		task: "two",
		initial: false,
		onUpdate: () => {
			throw new Error("progress");
		},
	});
	assert.equal(queue.queuedCount, 2);
	assert.equal(
		queue.removeQueued({} as never, new Error("missing")),
		false,
	);

	const active = queue.activateNext();
	assert.equal(active, first.request);
	assert.equal(queue.activateNext(), undefined);
	assert.equal(queue.current, first.request);
	assert.equal(queue.cancel(second.request, new Error("drop queued")), "queued");
	await assert.rejects(second.result, /drop queued/);

	emitRpcTurnUpdate(first.request, "running", "agent", true);
	first.request.onUpdate = () => {
		throw new Error("ignored");
	};
	emitRpcTurnUpdate(first.request, "running", "agent", true);

	assert.equal(
		queue.cancel({} as never, new Error("unknown")),
		undefined,
	);
	queue.rejectResponse(first.request, new Error("first fail"));
	queue.rejectResponse(first.request, new Error("duplicate"));
	assert.equal(queue.completeActive(first.request), true);
	await assert.rejects(first.result, /first fail/);

	const third = queue.enqueue({
		task: "three",
		initial: false,
		onUpdate: () => {},
	});
	third.request.promptSent = true;
	third.request.release = () => {
		throw new Error("lock");
	};
	const thirdActive = queue.activateNext();
	assert.equal(thirdActive, third.request);
	assert.equal(
		queue.cancel(third.request, new Error("cancel active"), {
			delayMs: 5,
			onTimeout: () => {},
		}),
		"active",
	);
	await assert.rejects(third.result, /cancel active/);
	assert.equal(queue.completeActive(third.request, undefined, new Error("done")), true);

	const fourth = queue.enqueue({ task: "four", initial: true });
	queue.activateNext();
	queue.rejectAll(new Error("shutdown"));
	await assert.rejects(fourth.result, /shutdown/);

	const fifth = queue.enqueue({ task: "five", initial: true });
	queue.activateNext();
	assert.equal(queue.completeActive(fifth.request), true);
	await assert.rejects(fifth.result, /未返回结果/);
});
