import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	removeSettledBackgroundSubagents,
	startBackgroundSubagent,
} from "../../../shared/subagent/background.ts";
import type { SubagentRunResult } from "../../../shared/subagent/run.ts";
import {
	createFakeContext,
	createFakePi,
	type FakePi,
} from "../../../shared/test/fake-extension.ts";
import {
	enqueueBackgroundCompletionNotice,
	markBackgroundCompletionConsumed,
	registerBackgroundCompletionNotices,
} from "../complete-notice.ts";

const result = (output = "done"): SubagentRunResult => ({
	output,
	model: "m",
	toolCalls: [],
	reusable: false,
	turn: 1,
	exitCode: 0,
	stderr: "",
});

let counter = 0;
const nextId = () => `cn-${process.pid}-${++counter}`;

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

async function emit(fake: FakePi, event: string, ctx: ExtensionContext) {
	for (const handler of fake.events.get(event) ?? []) await handler({}, ctx);
}

function notice(fake: FakePi) {
	return fake.messages as Array<{
		customType: string;
		content: string;
		details: { subagentId: string; status: string };
	}>;
}

function bind(sessionId: string) {
	const fake = createFakePi();
	registerBackgroundCompletionNotices(fake.pi);
	const ctx = createFakeContext({ sessionId });
	return { fake, ctx, sessionId };
}

test("idle settle sends a completion notice immediately", async () => {
	const { fake, sessionId } = bind(nextId());
	const job = startBackgroundSubagent({
		id: nextId(),
		title: "explore · demo",
		parentSessionId: sessionId,
		run: async () => result("report"),
		onSettled: (settled) => enqueueBackgroundCompletionNotice(settled, fake.pi),
	});
	await job.settled;
	assert.equal(notice(fake).length, 1);
	assert.equal(notice(fake)[0]?.customType, "subagent-complete");
	assert.match(notice(fake)[0]?.content ?? "", /finished successfully/);
	assert.deepEqual(notice(fake)[0]?.details, {
		subagentId: job.id,
		status: "completed",
	});
	enqueueBackgroundCompletionNotice(job, fake.pi);
	assert.equal(notice(fake).length, 1);
});

test("busy settle sends after agent_settled when the report was not read", async () => {
	const { fake, ctx, sessionId } = bind(nextId());
	await emit(fake, "agent_start", ctx);
	const job = startBackgroundSubagent({
		id: nextId(),
		title: "explore · demo",
		parentSessionId: sessionId,
		run: async () => result(),
		onSettled: (settled) => enqueueBackgroundCompletionNotice(settled, fake.pi),
	});
	await job.settled;
	assert.equal(notice(fake).length, 0);
	await emit(fake, "agent_settled", ctx);
	assert.equal(notice(fake).length, 1);
	assert.match(notice(fake)[0]?.content ?? "", /finished successfully/);
});

test("reading a settled report suppresses the later completion notice", async () => {
	const { fake, ctx, sessionId } = bind(nextId());
	await emit(fake, "agent_start", ctx);
	const job = startBackgroundSubagent({
		id: nextId(),
		title: "explore · demo",
		parentSessionId: sessionId,
		run: async () => result("report"),
		onSettled: (settled) => enqueueBackgroundCompletionNotice(settled, fake.pi),
	});
	await job.settled;
	markBackgroundCompletionConsumed(job.id);
	enqueueBackgroundCompletionNotice(job, fake.pi);
	await emit(fake, "agent_settled", ctx);
	assert.equal(notice(fake).length, 0);
});

test("progress output does not consume; shutdown drops a pending notice", async () => {
	const { fake, ctx, sessionId } = bind(nextId());
	await emit(fake, "agent_start", ctx);
	const gate = deferred<SubagentRunResult>();
	const job = startBackgroundSubagent({
		id: nextId(),
		title: "explore · demo",
		parentSessionId: sessionId,
		run: async (_signal, onToolCalls) => {
			onToolCalls([{ name: "read", arguments: { path: "a" } }]);
			return gate.promise;
		},
		onSettled: (settled) => enqueueBackgroundCompletionNotice(settled, fake.pi),
	});
	await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(job.status, "running");
	markBackgroundCompletionConsumed(job.id);
	gate.resolve(result());
	await job.settled;
	assert.equal(notice(fake).length, 0);
	await emit(fake, "session_shutdown", ctx);
	await emit(fake, "agent_settled", ctx);
	assert.equal(notice(fake).length, 0);
});

test("agent_settled does not flush while another run is in progress", async () => {
	const sessionId = nextId();
	const fake = createFakePi();
	registerBackgroundCompletionNotices(fake.pi);
	const busyCtx = createFakeContext({ sessionId, isIdle: false });
	const idleCtx = createFakeContext({ sessionId });
	await emit(fake, "agent_start", busyCtx);
	const job = startBackgroundSubagent({
		id: nextId(),
		title: "explore · demo",
		parentSessionId: sessionId,
		run: async () => result(),
		onSettled: (settled) => enqueueBackgroundCompletionNotice(settled, fake.pi),
	});
	await job.settled;
	await emit(fake, "agent_settled", busyCtx);
	assert.equal(notice(fake).length, 0);
	await emit(fake, "agent_settled", idleCtx);
	assert.equal(notice(fake).length, 1);
});

test("flush skips other sessions and dropped jobs", async () => {
	const { fake, ctx, sessionId } = bind(nextId());
	await emit(fake, "agent_start", ctx);
	const kept = startBackgroundSubagent({
		id: nextId(),
		title: "keep",
		parentSessionId: sessionId,
		run: async () => result(),
		onSettled: (settled) => enqueueBackgroundCompletionNotice(settled, fake.pi),
	});
	const dropped = startBackgroundSubagent({
		id: nextId(),
		title: "drop",
		parentSessionId: sessionId,
		run: async () => result(),
		onSettled: (settled) => enqueueBackgroundCompletionNotice(settled, fake.pi),
	});
	await Promise.all([kept.settled, dropped.settled]);
	const other = createFakeContext({ sessionId: nextId() });
	await emit(fake, "agent_settled", other);
	assert.equal(notice(fake).length, 0);
	await emit(fake, "session_shutdown", other);
	assert.equal(notice(fake).length, 0);
	removeSettledBackgroundSubagents(sessionId);
	await emit(fake, "session_shutdown", ctx);
	await emit(fake, "agent_settled", ctx);
	assert.equal(notice(fake).length, 0);
});

test("failed and cancelled notices use the matching copy", async () => {
	const { fake, sessionId } = bind(nextId());
	const failed = startBackgroundSubagent({
		id: nextId(),
		title: "fail",
		parentSessionId: sessionId,
		run: async () => {
			throw new Error("boom");
		},
		onSettled: (settled) => enqueueBackgroundCompletionNotice(settled, fake.pi),
	});
	await failed.settled;
	assert.match(notice(fake)[0]?.content ?? "", /failed: boom/);

	const cancelled = startBackgroundSubagent({
		id: nextId(),
		title: "cancel",
		parentSessionId: sessionId,
		run: (signal) =>
			new Promise((_resolve, reject) =>
				signal.addEventListener("abort", () => reject(new Error("aborted"))),
			),
		onSettled: (settled) => enqueueBackgroundCompletionNotice(settled, fake.pi),
	});
	cancelled.controller.abort();
	await cancelled.settled;
	assert.match(notice(fake)[1]?.content ?? "", /was cancelled/);

	const unlabeled = startBackgroundSubagent({
		id: nextId(),
		title: "fail",
		parentSessionId: sessionId,
		run: async () => {
			throw new Error("hidden");
		},
		onSettled: (settled) => {
			settled.error = undefined;
			enqueueBackgroundCompletionNotice(settled, fake.pi);
		},
	});
	await unlabeled.settled;
	assert.match(notice(fake)[2]?.content ?? "", /failed: unknown error/);
	markBackgroundCompletionConsumed("missing");
	enqueueBackgroundCompletionNotice(failed, fake.pi);
	assert.equal(notice(fake).length, 3);
});

test("a failed sendMessage does not stick as sent", async () => {
	const sessionId = nextId();
	const fake = createFakePi();
	let fail = true;
	const original = fake.pi.sendMessage.bind(fake.pi);
	fake.pi.sendMessage = ((message: unknown) => {
		if (fail) throw new Error("session gone");
		return original(message);
	}) as typeof fake.pi.sendMessage;
	const job = startBackgroundSubagent({
		id: nextId(),
		title: "explore · demo",
		parentSessionId: sessionId,
		run: async () => result(),
		onSettled: (settled) => enqueueBackgroundCompletionNotice(settled, fake.pi),
	});
	await job.settled;
	assert.equal(notice(fake).length, 0);
	fail = false;
	enqueueBackgroundCompletionNotice(job, fake.pi);
	assert.equal(notice(fake).length, 1);
});
