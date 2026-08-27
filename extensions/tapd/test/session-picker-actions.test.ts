import test from "node:test";
import assert from "node:assert/strict";
import type { Input } from "@earendil-works/pi-tui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	addProjectPath,
	applyListAction,
	beginCreate,
	beginCwdChoice,
	buildSessionOptions,
	confirmPendingDeletion,
	createPickerAction,
	removeHistoryPath,
	submitCreate,
	toggleProjectPath,
} from "../todo/session-picker-actions.ts";
import type { SessionPickerViewState } from "../todo/session-picker-view.ts";
import {
	createFakeContext,
	withTempAgentDir,
} from "../../shared/test/fake-extension.ts";

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

test("create flow remembers paths and confirm-delete updates the list", async (t) => {
	await withTempAgentDir(t, async () => {
		const current = state({
			itemName: "需求",
			pathHistory: ["/old"],
			selectedPaths: [],
		});
		beginCreate(current, "/cwd");
		assert.equal(current.isCreating, true);
		assert.deepEqual(current.selectedPaths, ["/cwd"]);
		addProjectPath(current, "  ");
		addProjectPath(current, "/cwd");
		addProjectPath(current, "/extra");
		assert.ok(current.selectedPaths.includes("/extra"));
		toggleProjectPath(current, 99);

		const options = buildSessionOptions([
			{
				sessionFile: "/tmp/s.jsonl",
				createdAt: "2026-01-01T00:00:00.000Z",
				title: "saved",
				projectPaths: ["/a"],
				workspaceId: "ws",
				itemId: "1",
				kind: "story",
				itemName: "需求",
			},
		]);
		assert.equal(options.at(-1)?.isCreate, true);
		assert.match(options[0]?.label ?? "", /saved/);

		const ctx = createFakeContext({ cwd: "/tmp" });
		(ctx.sessionManager as { getSessionFile: () => string }).getSessionFile = () =>
			"/tmp/current.jsonl";
		current.options = [
			{
				isCreate: false,
				label: "other",
				link: {
					sessionFile: "/tmp/missing.jsonl",
					createdAt: "1",
					workspaceId: "ws",
					itemId: "1",
					kind: "story",
					itemName: "需求",
				},
			},
			{ isCreate: true, label: "create" },
		];
		assert.deepEqual(
			applyListAction(current, { type: "delete" }, ctx),
			{ type: "redraw" },
		);
		assert.ok(current.pendingDelete);
		confirmPendingDeletion(current, ctx);
		assert.match(ctx.notifies.at(-1)?.message ?? "", /已不存在|已删除/);

		current.pendingDeletePath = "/cwd";
		confirmPendingDeletion(current, ctx);
		assert.match(ctx.notifies.at(-1)?.message ?? "", /已删除历史路径/);

		current.options = [
			{ isCreate: true, label: "create" },
			{ isCreate: false, label: "broken" },
		];
		current.selectedIdx = 0;
		assert.deepEqual(
			applyListAction(current, { type: "select" }, ctx),
			{ type: "redraw" },
		);
		assert.equal(current.isCreating, true);

		current.options = [{ isCreate: false, label: "broken" }];
		current.selectedIdx = 0;
		assert.deepEqual(
			applyListAction(current, { type: "select" }, ctx),
			{ type: "none" },
		);
		assert.match(ctx.notifies.at(-1)?.message ?? "", /无可恢复文件/);

		assert.deepEqual(
			submitCreate(state({ selectedPaths: [], pathInput: fakeInput("") })),
			{
				type: "create",
				draft: {
					title: "需求",
					projectPaths: [],
					workingDirectory: undefined,
				},
			},
		);
		removeHistoryPath(current, "/extra");
		assert.ok(!current.selectedPaths.includes("/extra"));
	});
});
