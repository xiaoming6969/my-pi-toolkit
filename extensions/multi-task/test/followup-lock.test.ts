import assert from "node:assert/strict";
import test from "node:test";
import {
	registerLiveSubagent,
	removeLiveSubagent,
	type LiveSubagentRun,
} from "../../shared/subagent/registry.ts";
import {
	findFollowupPathOwner,
	reserveFollowupPaths,
} from "../followup-lock.ts";
import { cancelBatchesForSession, findActivePathOwner } from "../manager.ts";
import { normalizeTaskPath } from "../task-policy.ts";
import type { MultiTaskBatch } from "../types.ts";
import { collectText } from "../view.ts";

test("implementation follow-up locks block overlapping paths until release", () => {
	const cwd = process.cwd();
	const path = normalizeTaskPath(cwd, "extensions/multi-task");
	const release = reserveFollowupPaths({
		subagentId: "lock-agent",
		kind: "implementation",
		batchId: "batch-1",
		workerId: "worker-1",
		cwd,
		paths: [path],
	});
	try {
		assert.deepEqual(
			findFollowupPathOwner(cwd, "extensions/multi-task/index.ts"),
			{ batchId: "batch-1", workerId: "worker-1" },
		);
		assert.deepEqual(
			findActivePathOwner(cwd, "extensions/multi-task/index.ts"),
			{ batchId: "batch-1", workerId: "worker-1" },
		);
		assert.throws(
			() =>
				reserveFollowupPaths({
					subagentId: "other-agent",
					kind: "implementation",
					batchId: "batch-2",
					workerId: "worker-2",
					cwd,
					paths: [normalizeTaskPath(cwd, "extensions/multi-task/view.ts")],
				}),
			/worker worker-1/,
		);
	} finally {
		release();
	}
	assert.equal(
		findActivePathOwner(cwd, "extensions/multi-task/index.ts"),
		undefined,
	);
});

test("research follow-ups may overlap each other but still reserve reads", () => {
	const cwd = process.cwd();
	const path = normalizeTaskPath(cwd, "extensions/repo-search-subagent");
	const first = reserveFollowupPaths({
		subagentId: "research-agent-1",
		kind: "research",
		batchId: "batch-r1",
		workerId: "research-1",
		cwd,
		paths: [path],
	});
	const second = reserveFollowupPaths({
		subagentId: "research-agent-2",
		kind: "research",
		batchId: "batch-r2",
		workerId: "research-2",
		cwd,
		paths: [path],
	});
	try {
		assert.equal(findFollowupPathOwner(cwd, path), undefined);
		assert.deepEqual(findFollowupPathOwner(cwd, path, true), {
			batchId: "batch-r1",
			workerId: "research-1",
		});
		assert.throws(
			() =>
				reserveFollowupPaths({
					subagentId: "implementation-agent",
					kind: "implementation",
					batchId: "batch-i",
					workerId: "implementation-1",
					cwd,
					paths: [path],
				}),
			/research-1/,
		);
	} finally {
		second();
		first();
	}
});

test("follow-up lock release is idempotent and ignores other cwd", () => {
	const cwd = process.cwd();
	const path = normalizeTaskPath(cwd, "extensions/chat-mode");
	const release = reserveFollowupPaths({
		subagentId: "lock-once",
		kind: "implementation",
		batchId: "batch-x",
		workerId: "worker-x",
		cwd,
		paths: [path],
	});
	try {
		assert.equal(findFollowupPathOwner("/tmp", path), undefined);
		release();
		release();
		assert.equal(findFollowupPathOwner(cwd, path), undefined);
	} finally {
		release();
	}
});


test("session cleanup disposes completed reusable workers", () => {
	const id = "completed-worker-agent";
	const parentSessionId = "cleanup-parent";
	let disposals = 0;
	const run: LiveSubagentRun = {
		id,
		title: "worker",
		model: "test/model",
		cwd: process.cwd(),
		status: "completed",
		startedAt: new Date().toISOString(),
		parentSessionId,
		reusable: true,
		turnCount: 1,
		lines: [],
		entries: [],
		request: () => Promise.reject(new Error("unused")),
		abort() {},
		dispose: () => disposals++,
		subscribe: () => () => {},
	};
	const batches = (
		globalThis as Record<PropertyKey, unknown>
	)[Symbol.for("my-pi-toolkit.multi-task-batches")] as Map<
		string,
		MultiTaskBatch
	>;
	const batch: MultiTaskBatch = {
		id: "cleanup-batch",
		cwd: process.cwd(),
		model: "test/model",
		parentSessionId,
		status: "completed",
		createdAt: new Date().toISOString(),
		maxConcurrency: 1,
		implementationTools: [],
		keepOpen: true,
		cancelRequested: false,
		workers: [
			{
				id: "worker-1",
				task: "done",
				paths: [],
				kind: "implementation",
				model: "test/model",
				status: "completed",
				subagentId: id,
				reusable: true,
				toolCalls: [],
				controller: new AbortController(),
			},
		],
	};
	registerLiveSubagent(run);
	batches.set(batch.id, batch);
	try {
		cancelBatchesForSession("other-parent");
		assert.equal(disposals, 0);
		cancelBatchesForSession(parentSessionId);
		assert.equal(disposals, 1);
	} finally {
		batches.delete(batch.id);
		removeLiveSubagent(id);
	}
});

test("collect output exposes reusable worker handles to the parent model", () => {
	const output = collectText({
		id: "batch-1",
		model: "test/model",
		status: "completed",
		createdAt: new Date().toISOString(),
		maxConcurrency: 1,
		workers: [
			{
				id: "worker-1",
				task: "done",
				paths: ["src"],
				kind: "implementation",
				model: "test/model",
				status: "completed",
				output: "x".repeat(60 * 1024),
				subagentId: "worker-agent",
				reusable: true,
				turn: 1,
				toolCalls: [],
			},
		],
	});
	assert.match(output, /输出已截断/);
	assert.match(output, /Reusable subagentId: worker-agent \(turn 1\)/);
});
