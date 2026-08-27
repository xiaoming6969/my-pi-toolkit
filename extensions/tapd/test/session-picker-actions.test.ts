import test from "node:test";
import assert from "node:assert/strict";
import type { Input } from "@earendil-works/pi-tui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	applyListAction,
	beginCwdChoice,
	createPickerAction,
	submitCreate,
	toggleProjectPath,
} from "../todo/session-picker-actions.ts";
import type { SessionPickerViewState } from "../todo/session-picker-view.ts";

function fakeInput(value = ""): Input {
	let current = value;
	return {
		getValue: () => current,
		setValue: (next: string) => {
			current = next;
		},
	} as Input;
}

function state(
	overrides: Partial<SessionPickerViewState> = {},
): SessionPickerViewState {
	return {
		options: [],
		selectedIdx: 0,
		pendingDelete: null,
		pendingDeletePath: null,
		cwdChoice: null,
		isCreating: false,
		selectedPaths: [],
		pathHistory: [],
		focus: 0,
		itemName: "需求",
		nameInput: fakeInput(""),
		pathInput: fakeInput(""),
		...overrides,
	};
}

test("createPickerAction uses the name input and pending path", () => {
	const current = state({
		itemName: "需求",
		nameInput: fakeInput("  登录  "),
		selectedPaths: ["/a"],
		pathInput: fakeInput("/b"),
	});
	assert.deepEqual(createPickerAction(current), {
		type: "create",
		draft: {
			title: "登录",
			projectPaths: ["/a", "/b"],
			workingDirectory: undefined,
		},
	});
});

test("submitCreate asks for a cwd when more than one path is selected", () => {
	const current = state({
		selectedPaths: ["/a"],
		pathInput: fakeInput("/b"),
	});
	assert.equal(submitCreate(current), "cwd-choice");
	assert.deepEqual(current.cwdChoice, { paths: ["/a", "/b"], index: 0 });

	const single = state({ selectedPaths: ["/only"] });
	assert.deepEqual(submitCreate(single), {
		type: "create",
		draft: {
			title: "需求",
			projectPaths: ["/only"],
			workingDirectory: "/only",
		},
	});
});

test("toggleProjectPath and beginCwdChoice only mutate memory", () => {
	const current = state({
		pathHistory: ["/a", "/b"],
		selectedPaths: ["/a"],
	});
	toggleProjectPath(current, 0);
	toggleProjectPath(current, 1);
	assert.deepEqual(current.selectedPaths, ["/b"]);
	beginCwdChoice(current, ["/b", "/c"]);
	assert.deepEqual(current.cwdChoice, { paths: ["/b", "/c"], index: 0 });
});

test("applyListAction navigates, cancels, and switches sessions", () => {
	const notifies: string[] = [];
	const ctx = {
		cwd: "/tmp",
		ui: { notify: (message: string) => notifies.push(message) },
		sessionManager: { getSessionFile: () => "/tmp/current.jsonl" },
	} as unknown as ExtensionContext;
	const current = state({
		options: [
			{
				isCreate: false,
				label: "saved",
				link: {
					sessionFile: "/tmp/other.jsonl",
					createdAt: "1",
					workspaceId: "ws",
					itemId: "1",
					kind: "story",
					itemName: "需求",
				},
			},
		],
	});
	assert.deepEqual(applyListAction(current, { type: "navigate", target: 0 }, ctx), {
		type: "redraw",
	});
	assert.deepEqual(applyListAction(current, { type: "cancel" }, ctx), {
		type: "done",
		result: null,
	});
	assert.deepEqual(applyListAction(current, { type: "select" }, ctx), {
		type: "done",
		result: { type: "switch", sessionFile: "/tmp/other.jsonl" },
	});

	current.options[0]!.link!.sessionFile = "/tmp/current.jsonl";
	assert.deepEqual(applyListAction(current, { type: "delete" }, ctx), {
		type: "none",
	});
	assert.match(notifies.at(-1) ?? "", /不能删除当前会话/);
});
