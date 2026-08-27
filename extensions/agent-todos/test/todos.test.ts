import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	countTodos,
	formatTodosForModel,
	isTodoStatus,
	mergeTodos,
	summarizeChanges,
	validateTodoWrite,
	type TodoItem,
} from "../model.ts";
import {
	TOOL_NAME,
	todoFocusReminder,
	todoSystemPromptAppend,
} from "../prompt.ts";
import { renderTodoCall, renderTodoResult } from "../render.ts";
import { statusText, TodoStore } from "../store.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

function todo(
	id: string,
	status: TodoItem["status"],
	content = id,
): TodoItem {
	return { id, content, status };
}

test("isTodoStatus and countTodos track active versus cancelled", () => {
	assert.equal(isTodoStatus("pending"), true);
	assert.equal(isTodoStatus("blocked"), false);
	assert.deepEqual(
		countTodos([
			todo("a", "pending"),
			todo("b", "in_progress"),
			todo("c", "completed"),
			todo("d", "cancelled"),
		]),
		{
			total: 4,
			pending: 1,
			inProgress: 1,
			completed: 1,
			cancelled: 1,
			active: 3,
		},
	);
});

test("mergeTodos replaces or merges by id without aliasing", () => {
	const existing = [todo("a", "pending", "old")];
	const incoming = [todo("a", "completed", "new"), todo("b", "pending")];
	const replaced = mergeTodos(existing, incoming, false);
	assert.deepEqual(replaced, incoming);
	replaced[0].content = "mutated";
	assert.equal(incoming[0].content, "new");

	const merged = mergeTodos(existing, incoming, true);
	assert.deepEqual(
		merged.map((item) => item.id),
		["a", "b"],
	);
	assert.equal(merged[0].content, "new");
});

test("validateTodoWrite rejects invalid payloads and extra in_progress items", () => {
	assert.equal(validateTodoWrite([], "nope", true).ok, false);
	assert.match(
		(validateTodoWrite([], [{ id: "a", content: "one", status: "pending" }], false) as { error: string }).error,
		/merge=false requires 0 todos/,
	);
	assert.equal(validateTodoWrite([], [], false).ok, true);
	assert.match(
		(validateTodoWrite([], [{ id: " ", content: "x", status: "pending" }], true) as { error: string }).error,
		/id is required/,
	);
	assert.match(
		(validateTodoWrite([], [{ id: "a", content: " ", status: "pending" }], true) as { error: string }).error,
		/content is required/,
	);
	assert.match(
		(validateTodoWrite([], [{ id: "a", content: "x", status: "blocked" }], true) as { error: string }).error,
		/status must be/,
	);
	assert.match(
		(
			validateTodoWrite(
				[],
				[
					{ id: "a", content: "one", status: "pending" },
					{ id: "a", content: "two", status: "pending" },
				],
				false,
			) as { error: string }
		).error,
		/duplicate id/,
	);
	assert.match(
		(
			validateTodoWrite(
				[todo("a", "in_progress")],
				[{ id: "b", content: "two", status: "in_progress" }],
				true,
			) as { error: string }
		).error,
		/at most one in_progress/,
	);
	const ok = validateTodoWrite(
		[],
		[
			{ id: " a ", content: " one ", status: "pending" },
			{ id: "b", content: "two", status: "in_progress" },
		],
		false,
	);
	assert.equal(ok.ok, true);
	if (ok.ok) {
		assert.deepEqual(ok.todos[0], todo("a", "pending", "one"));
	}
});

test("formatTodosForModel and summarizeChanges describe list updates", () => {
	const empty = formatTodosForModel([], false, countTodos([]));
	assert.match(empty, /merge=false/);
	assert.match(empty, /\(no todos\)/);

	const todos = [todo("a", "in_progress", "Implement"), todo("b", "pending", "Test")];
	const focused = formatTodosForModel(todos, true, countTodos(todos));
	assert.match(focused, /\[in_progress\] a — Implement/);
	assert.match(focused, /only "Implement" is in_progress/);

	const idle = formatTodosForModel(
		[todo("a", "pending")],
		true,
		countTodos([todo("a", "pending")]),
	);
	assert.match(idle, /no todo is in_progress/);

	assert.deepEqual(
		summarizeChanges(
			[todo("a", "pending", "old"), todo("keep", "pending")],
			[todo("a", "completed", "new"), todo("b", "completed"), todo("keep", "pending")],
		),
		{ added: 1, updated: 1, completed: 2 },
	);
});

test("TodoStore copies state and rebuilds from the last successful write", () => {
	const store = new TodoStore();
	assert.equal(statusText(store.getTodos()), undefined);
	store.setTodos([todo("a", "pending")]);
	const copy = store.getTodos();
	copy[0].content = "mutated";
	assert.equal(store.getTodos()[0].content, "a");
	assert.equal(statusText(store.getTodos()), "📋 0/1");
	assert.equal(statusText([todo("a", "completed")]), "✅ 1/1");
	assert.equal(statusText([todo("a", "cancelled")]), "✅ 0/0");

	store.reconstructFromBranch([
		{ type: "session" },
		{
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo_write",
				details: { todos: [todo("legacy", "pending")] },
			},
		},
		{
			type: "message",
			message: {
				role: "toolResult",
				toolName: TOOL_NAME,
				details: { todos: [todo("latest", "completed")] },
			},
		},
		{
			type: "message",
			message: {
				role: "toolResult",
				toolName: TOOL_NAME,
				details: { error: "failed", todos: [] },
			},
		},
	]);
	assert.deepEqual(store.getTodos(), [todo("latest", "completed")]);
	store.clear();
	assert.deepEqual(store.getTodos(), []);
});

test("todo reminders name the current and next items", () => {
	assert.match(todoSystemPromptAppend(), new RegExp(TOOL_NAME));
	assert.equal(todoFocusReminder([]), undefined);
	assert.equal(todoFocusReminder([todo("a", "cancelled")]), undefined);

	const currentOnly = todoFocusReminder([todo("a", "in_progress", "Now")]);
	assert.match(currentOnly ?? "", /Current in_progress: a — Now/);
	assert.doesNotMatch(currentOnly ?? "", /Next pending/);

	const nextOnly = todoFocusReminder([todo("b", "pending", "Next")]);
	assert.match(nextOnly ?? "", /Current in_progress: none/);
	assert.match(nextOnly ?? "", /Next pending: b — Next/);
	assert.match(nextOnly ?? "", /mark the appropriate pending item in_progress/);
});

test("todo renderers summarize merge, errors, and expanded details", () => {
	const mergeCall = renderTodoCall({ merge: true, todos: [{}] }, theme).render(80).join("\n");
	assert.match(mergeCall, /agent_todo_write/);
	assert.match(mergeCall, /merge/);
	assert.match(mergeCall, /1 item\b/);
	assert.match(
		renderTodoCall({ merge: false, todos: [{}, {}] }, theme).render(80).join("\n"),
		/replace/,
	);

	assert.match(
		renderTodoResult({ content: [{ type: "text", text: "missing" }] }, false, theme)
			.render(80)
			.join("\n"),
		/missing/,
	);
	assert.match(
		renderTodoResult(
			{ content: [], details: { action: "write", merge: true, todos: [], counts: countTodos([]), error: "bad" } },
			false,
			theme,
		)
			.render(80)
			.join("\n"),
		/bad/,
	);

	const details = {
		action: "write" as const,
		merge: true,
		todos: [todo("a", "completed", "Done")],
		counts: countTodos([todo("a", "completed", "Done")]),
		changes: { added: 1, updated: 2, completed: 1 },
	};
	const collapsed = renderTodoResult({ content: [], details }, false, theme)
		.render(80)
		.join("\n");
	assert.match(collapsed, /\+1/);
	assert.match(collapsed, /Ctrl\+O details/);
	const expanded = renderTodoResult({ content: [], details }, true, theme)
		.render(80)
		.join("\n");
	assert.match(expanded, /completed\s+a {2}Done/);
	assert.match(
		renderTodoResult(
			{
				content: [],
				details: {
					action: "write",
					merge: false,
					todos: [],
					counts: countTodos([]),
				},
			},
			false,
			theme,
		)
			.render(80)
			.join("\n"),
		/cleared/,
	);
});
