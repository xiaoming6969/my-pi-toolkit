import assert from "node:assert/strict";
import test from "node:test";
import { startBackgroundSubagent } from "../../shared/subagent/background.ts";
import {
	registerLiveSubagent,
	removeLiveSubagent,
	type LiveSubagentRun,
} from "../../shared/subagent/registry.ts";
import {
	formatTodosForModel,
	countTodos,
	summarizeChanges,
	syncTodosWithSubagents,
	validateTodoWrite,
	type TodoItem,
} from "../model.ts";
import { TODO_SYNC_ENTRY_TYPE, TodoStore } from "../store.ts";
import {
	collectCompletedSubagentIds,
	subscribeCompletedSubagents,
} from "../subagent-sync.ts";

test("validateTodoWrite accepts an optional subagentId link", () => {
	const ok = validateTodoWrite(
		[],
		[
			{ id: "a", content: "research", status: "in_progress", subagentId: " sub-1 " },
			{ id: "b", content: "impl", status: "pending", subagentId: "" },
		],
		false,
	);
	assert.ok(ok.ok);
	if (!ok.ok) return;
	assert.equal(ok.todos[0]?.subagentId, "sub-1");
	assert.equal("subagentId" in (ok.todos[1] ?? {}), false);
	const bad = validateTodoWrite(
		[],
		[{ id: "a", content: "x", status: "pending", subagentId: 3 }],
		true,
	);
	assert.deepEqual(bad, { ok: false, error: "todos[0].subagentId must be a string" });
	assert.match(
		formatTodosForModel(ok.todos, false, countTodos(ok.todos)),
		/\[in_progress\] a — research \(subagent sub-1\)/,
	);
	assert.equal(
		summarizeChanges(
			[{ id: "a", content: "x", status: "pending" }],
			[{ id: "a", content: "x", status: "pending", subagentId: "s" }],
		).updated,
		1,
	);
});

test("syncTodosWithSubagents completes open linked todos only", () => {
	const todos: TodoItem[] = [
		{ id: "a", content: "a", status: "in_progress", subagentId: "done" },
		{ id: "b", content: "b", status: "pending", subagentId: "running" },
		{ id: "c", content: "c", status: "cancelled", subagentId: "done" },
		{ id: "d", content: "d", status: "pending" },
	];
	const { todos: next, completed } = syncTodosWithSubagents(todos, new Set(["done"]));
	assert.deepEqual(
		next.map((todo) => todo.status),
		["completed", "pending", "cancelled", "pending"],
	);
	assert.deepEqual(completed.map((todo) => todo.id), ["a"]);
	assert.equal(todos[0]?.status, "in_progress");
});

test("store reconstruction honours subagent sync entries", () => {
	const store = new TodoStore();
	store.reconstructFromBranch([
		{
			type: "message",
			message: {
				role: "toolResult",
				toolName: "agent_todo_write",
				details: { todos: [{ id: "a", content: "a", status: "pending", subagentId: "s" }] },
			},
		},
		{
			type: "custom",
			customType: TODO_SYNC_ENTRY_TYPE,
			data: { todos: [{ id: "a", content: "a", status: "completed", subagentId: "s" }] },
		},
		{ type: "custom", customType: "other", data: {} },
		{ type: "custom", customType: TODO_SYNC_ENTRY_TYPE, data: { todos: "bad" } },
	]);
	assert.deepEqual(store.getTodos(), [
		{ id: "a", content: "a", status: "completed", subagentId: "s" },
	]);
});

test("completed subagent ids come from background jobs and live runs", async () => {
	const job = startBackgroundSubagent({
		id: `todo-sync-${process.pid}`,
		title: "t",
		parentSessionId: "s",
		run: async () => ({ output: "", model: "m", toolCalls: [], reusable: false, turn: 1, exitCode: 0, stderr: "" }),
	});
	const run: LiveSubagentRun = {
		id: `todo-live-${process.pid}`,
		title: "t",
		model: "m",
		cwd: process.cwd(),
		status: "running",
		startedAt: "2026-01-01T00:00:00.000Z",
		parentSessionId: "s",
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
	};
	const seen: Set<string>[] = [];
	const unsubscribe = subscribeCompletedSubagents((ids) => seen.push(ids));
	registerLiveSubagent(run);
	try {
		await job.settled;
		const ids = collectCompletedSubagentIds();
		assert.ok(ids.has(job.id));
		assert.equal(ids.has(run.id), false);
		run.status = "completed";
		assert.ok(collectCompletedSubagentIds().has(run.id));
		assert.ok(seen.length > 0);
	} finally {
		unsubscribe();
		removeLiveSubagent(run.id);
	}
});
