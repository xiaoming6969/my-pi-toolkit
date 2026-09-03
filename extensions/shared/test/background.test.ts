import assert from "node:assert/strict";
import test from "node:test";
import {
	cancelBackgroundSubagent,
	cancelBackgroundSubagentsForSession,
	getBackgroundSubagent,
	isBackgroundJobActive,
	listBackgroundSubagents,
	removeSettledBackgroundSubagents,
	startBackgroundSubagent,
	subscribeBackgroundSubagents,
	waitForBackgroundSubagents,
} from "../subagent/background.ts";
import type { SubagentRunResult } from "../subagent/run.ts";

const result = (output: string): SubagentRunResult => ({
	output,
	model: "m",
	toolCalls: [],
	reusable: false,
	turn: 1,
	exitCode: 0,
	stderr: "",
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

let counter = 0;
const nextId = () => `job-${process.pid}-${++counter}`;

test("background job tracks queued → running → completed and notifies", async () => {
	const gate = deferred<SubagentRunResult>();
	const events: string[] = [];
	const unsubscribe = subscribeBackgroundSubagents(() => events.push("changed"));
	const settled: string[] = [];
	const job = startBackgroundSubagent({
		id: nextId(),
		title: "explore · demo",
		parentSessionId: "s1",
		run: async (_signal, onToolCalls) => {
			await new Promise((resolve) => setImmediate(resolve));
			onToolCalls([{ name: "read", arguments: { path: "a" } }]);
			return gate.promise;
		},
		onSettled: (item) => settled.push(item.status),
	});
	assert.equal(job.status, "queued");
	assert.equal(isBackgroundJobActive(job), true);
	await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(job.status, "running");
	assert.equal(job.toolCalls.length, 1);
	gate.resolve(result("done"));
	const finished = await job.settled;
	assert.equal(finished.status, "completed");
	assert.equal(finished.result?.output, "done");
	assert.deepEqual(settled, ["completed"]);
	assert.ok(events.length >= 3);
	assert.equal(getBackgroundSubagent(job.id), job);
	assert.ok(listBackgroundSubagents("s1").includes(job));
	assert.equal(listBackgroundSubagents("other").includes(job), false);
	unsubscribe();
	assert.throws(
		() =>
			startBackgroundSubagent({
				id: job.id,
				title: "dup",
				parentSessionId: "s1",
				run: async () => result(""),
			}),
		/已存在/,
	);
});

test("failures and cancellations settle with the right status", async () => {
	const failing = startBackgroundSubagent({
		id: nextId(),
		title: "fail",
		parentSessionId: "s2",
		run: async () => {
			throw new Error("boom");
		},
		onSettled: () => {
			throw new Error("listener error is swallowed");
		},
	});
	assert.equal((await failing.settled).status, "failed");
	assert.equal(failing.error, "boom");

	const cancelled = startBackgroundSubagent({
		id: nextId(),
		title: "cancel",
		parentSessionId: "s2",
		run: (signal) =>
			new Promise((_resolve, reject) =>
				signal.addEventListener("abort", () => reject(new Error("aborted"))),
			),
	});
	assert.equal(cancelBackgroundSubagent(cancelled.id), true);
	assert.equal((await cancelled.settled).status, "cancelled");
	assert.equal(cancelBackgroundSubagent(cancelled.id), false);
	assert.equal(cancelBackgroundSubagent("missing"), false);

	const perSession = startBackgroundSubagent({
		id: nextId(),
		title: "session",
		parentSessionId: "s3",
		run: (signal) =>
			new Promise((_resolve, reject) =>
				signal.addEventListener("abort", () => reject(new Error("aborted"))),
			),
	});
	cancelBackgroundSubagentsForSession("s3");
	assert.equal((await perSession.settled).status, "cancelled");
	assert.ok(removeSettledBackgroundSubagents("s3") >= 1);
	assert.equal(getBackgroundSubagent(perSession.id), undefined);
});

test("waitForBackgroundSubagents supports wait_all, wait_any and timeouts", async () => {
	const first = deferred<SubagentRunResult>();
	const second = deferred<SubagentRunResult>();
	const a = startBackgroundSubagent({
		id: nextId(),
		title: "a",
		parentSessionId: "s4",
		run: () => first.promise,
	});
	const b = startBackgroundSubagent({
		id: nextId(),
		title: "b",
		parentSessionId: "s4",
		run: () => second.promise,
	});
	const timedOut = await waitForBackgroundSubagents({
		ids: [a.id, b.id],
		mode: "wait_all",
		timeoutMs: 20,
	});
	assert.equal(timedOut.timedOut, true);
	assert.equal(timedOut.jobs.length, 2);

	setTimeout(() => first.resolve(result("a")), 5);
	const any = await waitForBackgroundSubagents({
		ids: [a.id, b.id],
		mode: "wait_any",
		timeoutMs: 5000,
	});
	assert.equal(any.timedOut, false);
	assert.equal(a.status, "completed");
	assert.equal(isBackgroundJobActive(b), true);

	const alreadySettled = await waitForBackgroundSubagents({
		ids: [a.id, b.id],
		mode: "wait_any",
		timeoutMs: 5000,
	});
	assert.equal(alreadySettled.timedOut, false);

	const controller = new AbortController();
	const aborted = waitForBackgroundSubagents({
		ids: [b.id],
		mode: "wait_all",
		timeoutMs: 5000,
		signal: controller.signal,
	});
	controller.abort();
	assert.equal((await aborted).timedOut, true);

	second.resolve(result("b"));
	const all = await waitForBackgroundSubagents({
		ids: [a.id, b.id],
		mode: "wait_all",
		timeoutMs: 5000,
	});
	assert.equal(all.timedOut, false);
	await assert.rejects(
		waitForBackgroundSubagents({ ids: ["nope"], mode: "wait_all", timeoutMs: 10 }),
		/未找到后台子 Agent/,
	);
});
