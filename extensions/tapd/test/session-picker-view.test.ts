import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Input } from "@earendil-works/pi-tui";
import { renderSessionPicker, type SessionPickerViewState } from "../todo/session-picker-view.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

function fakeInput(value = "", lines = ["input"]): Input {
	return {
		getValue: () => value,
		setValue() {},
		render: () => lines,
	} as Input;
}

function state(overrides: Partial<SessionPickerViewState> = {}): SessionPickerViewState {
	return {
		options: [
			{ isCreate: false, label: "saved session" },
			{ isCreate: true, label: "create" },
		],
		selectedIdx: 0,
		pendingDelete: null,
		pendingDeletePath: null,
		cwdChoice: null,
		isCreating: false,
		selectedPaths: [],
		pathHistory: [],
		focus: 0,
		itemName: "登录",
		nameInput: fakeInput(""),
		pathInput: fakeInput(""),
		...overrides,
	};
}

test("renderSessionPicker lists options and confirm-delete states", () => {
	const listed = renderSessionPicker(state(), theme, 80, 20).join("\n");
	assert.match(listed, /登录/);
	assert.match(listed, /saved session/);

	const deleting = renderSessionPicker(
		state({
			pendingDelete: {
				sessionFile: "/s.jsonl",
				createdAt: "1",
				title: "old",
				workspaceId: "ws",
				itemId: "1",
				kind: "story",
				itemName: "登录",
			},
		}),
		theme,
		80,
		20,
	).join("\n");
	assert.match(deleting, /确认删除/);

	const deletingPath = renderSessionPicker(
		state({ pendingDeletePath: "/tmp/repo" }),
		theme,
		80,
		20,
	).join("\n");
	assert.match(deletingPath, /确认从历史中删除/);
});

test("renderSessionPicker covers create and cwd-choice layouts", () => {
	const cwd = renderSessionPicker(
		state({
			cwdChoice: { paths: ["/a", "/b", "/c"], index: 1 },
		}),
		theme,
		80,
		20,
	).join("\n");
	assert.match(cwd, /选择工作目录/);
	assert.match(cwd, /\/b/);

	const creating = renderSessionPicker(
		state({
			isCreating: true,
			pathHistory: ["/one", "/two"],
			selectedPaths: ["/one"],
			focus: 1,
			nameInput: fakeInput("name"),
			pathInput: fakeInput("pending"),
		}),
		theme,
		80,
		24,
	).join("\n");
	assert.match(creating, /创建新会话/);
	assert.match(creating, /\[x\]/);
	assert.match(creating, /创建会话/);
});
