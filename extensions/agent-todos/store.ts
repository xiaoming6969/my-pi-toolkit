import {
	type TodoItem,
	type TodoWriteDetails,
	countTodos,
} from "./model.js";
import { TOOL_NAME } from "./prompt.js";

/** 历史会话可能仍使用旧工具名 todo_write */
const TOOL_RESULT_NAMES = new Set([TOOL_NAME, "todo_write"]);
/** 子 Agent 完成后自动写回的清单快照，与工具结果一样参与重建 */
export const TODO_SYNC_ENTRY_TYPE = "agent-todos-subagent-sync";

export class TodoStore {
	private todos: TodoItem[] = [];

	getTodos(): TodoItem[] {
		return this.todos.map((todo) => ({ ...todo }));
	}

	setTodos(todos: TodoItem[]): void {
		this.todos = todos.map((todo) => ({ ...todo }));
	}

	clear(): void {
		this.todos = [];
	}

	/** 从会话分支重建：取最后一次成功的 agent_todo_write / todo_write details */
	reconstructFromBranch(entries: Iterable<unknown>): void {
		this.todos = [];
		for (const entry of entries) {
			const synced = syncEntryTodos(entry);
			if (synced) {
				this.todos = synced.map((todo) => ({ ...todo }));
				continue;
			}
			if (!isMessageEntry(entry)) continue;
			const msg = entry.message;
			if (msg.role !== "toolResult") continue;
			if (typeof msg.toolName !== "string" || !TOOL_RESULT_NAMES.has(msg.toolName)) {
				continue;
			}
			const details = msg.details as TodoWriteDetails | undefined;
			if (!details || details.error || !Array.isArray(details.todos)) continue;
			this.todos = details.todos.map((todo) => ({ ...todo }));
		}
	}
}

export function statusText(todos: TodoItem[]): string | undefined {
	if (todos.length === 0) return undefined;
	const counts = countTodos(todos);
	if (counts.active === 0) {
		return `✅ ${counts.completed}/${counts.completed}`;
	}
	const prefix = counts.completed === counts.active ? "✅" : "📋";
	return `${prefix} ${counts.completed}/${counts.active}`;
}

function syncEntryTodos(entry: unknown): TodoItem[] | undefined {
	if (!entry || typeof entry !== "object") return undefined;
	const value = entry as { type?: unknown; customType?: unknown; data?: unknown };
	if (value.type !== "custom" || value.customType !== TODO_SYNC_ENTRY_TYPE)
		return undefined;
	const todos = (value.data as { todos?: unknown } | undefined)?.todos;
	return Array.isArray(todos) ? (todos as TodoItem[]) : undefined;
}

function isMessageEntry(
	entry: unknown,
): entry is { type: "message"; message: Record<string, unknown> } {
	if (!entry || typeof entry !== "object") return false;
	const value = entry as { type?: unknown; message?: unknown };
	return value.type === "message" && !!value.message && typeof value.message === "object";
}
