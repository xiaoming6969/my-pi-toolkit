import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { extractLocateReason } from "../documents/bug-reject-reason.ts";
import {
	isTapdDocumentKind,
	previewTapdDocument,
	previewUpdatedTapdDocument,
	snapshotTapdDocument,
} from "../documents/preview.ts";
import {
	ANALYZE_TRIGGER_PROMPT,
	COLLABORATION_TRIGGER_PROMPT,
	DESIGN_TRIGGER_PROMPT,
	buildBugContextPrompt,
	buildBugLocatePrompt,
	buildUnderstandPrompt,
} from "../documents/prompts.ts";
import { getUnderstandingDocPath } from "../sessions/docs.ts";
import {
	TAPD_SESSION_STATE_TYPE,
	type TapdSessionState,
} from "../sessions/session-state.ts";
import { locateTapdBug } from "../documents/workflows.ts";
import { createFakeContext, createFakePi } from "../../shared/test/fake-extension.ts";

const state: TapdSessionState = {
	version: 1,
	workspaceId: "ws",
	itemId: "12",
	kind: "story",
	itemName: "需求",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

test("isTapdDocumentKind only accepts known document kinds", () => {
	assert.equal(isTapdDocumentKind("understanding"), true);
	assert.equal(isTapdDocumentKind("design"), true);
	assert.equal(isTapdDocumentKind("collaboration"), true);
	assert.equal(isTapdDocumentKind("plan"), false);
});

test("extractLocateReason reads the latest assistant ## 原因 section", () => {
	assert.equal(extractLocateReason([]), "");
	assert.equal(
		extractLocateReason([
			{
				type: "message",
				message: {
					role: "assistant",
					content: "## 原因\n旧原因\n\n## 因果链\nx",
				},
			},
			{
				type: "message",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "## 原因\n空指针未判空\n\n## 因果链\n1" }],
				},
			},
		] as never),
		"空指针未判空",
	);
	assert.equal(
		extractLocateReason([
			{ type: "custom" },
			{
				type: "message",
				message: { role: "user", content: "## 原因\n不是" },
			},
			{
				type: "message",
				message: {
					role: "assistant",
					content: ["忽略", { type: "image" }, { type: "text", text: "无标题" }],
				},
			},
		] as never),
		"",
	);
	assert.equal(
		extractLocateReason([
			{
				type: "message",
				message: { role: "assistant", content: { text: "nope" } },
			},
		] as never),
		"",
	);
});

test("snapshotTapdDocument reads the story understanding file", async (t) => {
	const cwd = await mkdtemp(join(tmpdir(), "tapd-doc-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	const path = getUnderstandingDocPath(cwd, "story-12");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, "# 理解\n");
	const snapshot = await snapshotTapdDocument(
		{
			cwd,
			sessionManager: {
				getEntries: () => [
					{ type: "custom", customType: TAPD_SESSION_STATE_TYPE, data: state },
				],
			},
		} as never,
		"understanding",
	);
	assert.equal(snapshot?.path, path);
	assert.match(snapshot?.content ?? "", /理解/);
	assert.equal(
		await snapshotTapdDocument(
			{
				cwd,
				sessionManager: {
					getEntries: () => [
						{
							type: "custom",
							customType: TAPD_SESSION_STATE_TYPE,
							data: { ...state, kind: "bug" },
						},
					],
				},
			} as never,
			"understanding",
		),
		undefined,
	);
});

test("document prompts include ids, urls, and empty-description fallbacks", () => {
	const understand = buildUnderstandPrompt({
		title: "登录",
		storyId: "12",
		url: "https://tapd.example/12",
		description: "   ",
		projectPaths: [],
		understandingFile: "/tmp/understanding.md",
	});
	assert.match(understand, /ID：12/);
	assert.match(understand, /（无描述）/);
	assert.match(understand, /未指定/);
	const bug = buildBugContextPrompt({
		title: "崩溃",
		bugId: "8",
		url: "https://tapd.example/8",
		description: "boom",
		projectPaths: ["src"],
	});
	assert.match(bug, /- src/);
	assert.match(bug, /## 缺陷描述\nboom/);
	assert.match(bug, /执行 \/tapd bug 结合项目代码/);
	assert.doesNotMatch(bug, /完整缺陷信息/);
	const locate = buildBugLocatePrompt();
	assert.match(locate, /根据上文 TAPD 缺陷信息/);
	assert.match(locate, /## 定位要求/);
	assert.match(locate, /## 原因/);
	assert.doesNotMatch(locate, /TAPD 完整字段/);
	assert.doesNotMatch(locate, /custom_field_/);
	assert.doesNotMatch(locate, /<p style=/);
	assert.match(ANALYZE_TRIGGER_PROMPT, /不要调用 enter_plan_mode/);
	assert.match(DESIGN_TRIGGER_PROMPT, /ask_user_choice/);
	assert.match(COLLABORATION_TRIGGER_PROMPT, /collaboration\.md/);
});

test("locateTapdBug sends a visible prompt from session context", async () => {
	const { pi, userMessages, messages } = createFakePi();
	await locateTapdBug(
		pi,
		createFakeContext({
			entries: [
				{
					type: "custom",
					customType: TAPD_SESSION_STATE_TYPE,
					data: { ...state, kind: "bug", itemName: "崩溃" },
				},
			],
		}) as never,
	);
	assert.equal(messages.length, 0);
	assert.equal(userMessages.length, 1);
	assert.match(String(userMessages[0]), /根据上文 TAPD 缺陷信息/);
	assert.match(String(userMessages[0]), /## 定位要求/);

	const idle = createFakePi();
	const busyCtx = createFakeContext({ isIdle: false });
	await locateTapdBug(idle.pi, busyCtx as never);
	assert.equal(idle.userMessages.length, 0);
	assert.match(busyCtx.notifies[0]?.message ?? "", /正在执行/);
});

test("previewTapdDocument routes missing docs, feedback, and unchanged snapshots", async (t) => {
	const cwd = await mkdtemp(join(tmpdir(), "tapd-preview-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	const understanding = getUnderstandingDocPath(cwd, "story-12");
	await mkdir(dirname(understanding), { recursive: true });
	const { pi, userMessages } = createFakePi();
	const notifies: string[] = [];
	const ctx = {
		cwd,
		mode: "rpc" as const,
		isIdle: () => true,
		ui: {
			notify(message: string) {
				notifies.push(message);
			},
			async select(_title: string, choices: string[]) {
				return choices[0];
			},
		},
		sessionManager: {
			getEntries: () => [
				{ type: "custom", customType: TAPD_SESSION_STATE_TYPE, data: state },
			],
		},
	};

	await previewTapdDocument(
		pi,
		{ open: async () => ({ status: "closed" }) } as never,
		{
			...ctx,
			sessionManager: { getEntries: () => [] },
		} as never,
	);
	assert.match(notifies.at(-1) ?? "", /没有关联 TAPD 需求/);

	await previewTapdDocument(
		pi,
		{ open: async () => ({ status: "closed" }) } as never,
		ctx as never,
	);
	assert.match(notifies.at(-1) ?? "", /understanding\.md 不存在或为空/);

	await writeFile(understanding, "# 理解\n");
	await previewTapdDocument(
		pi,
		{ open: async () => ({ status: "closed" }) } as never,
		ctx as never,
		"design",
	);
	assert.match(notifies.at(-1) ?? "", /design.md 不存在或为空/);

	const snapshot = await snapshotTapdDocument(ctx as never, "understanding");
	assert.ok(snapshot?.content);
	await previewTapdDocument(
		pi,
		{ open: async () => ({ status: "feedback", feedback: "请改范围" }) } as never,
		{ ...ctx, isIdle: () => false } as never,
		"understanding",
	);
	assert.match(String(userMessages.at(-1)), /请改范围/);

	await previewTapdDocument(
		pi,
		{ open: async () => ({ status: "feedback", feedback: "idle-edit" }) } as never,
		ctx as never,
		"understanding",
	);
	assert.match(String(userMessages.at(-1)), /idle-edit/);

	await previewUpdatedTapdDocument(
		pi,
		{ open: async () => ({ status: "closed" }) } as never,
		ctx as never,
		snapshot!,
	);
	assert.match(notifies.at(-1) ?? "", /未生成新内容/);

	await writeFile(understanding, "# 更新\n");
	await previewUpdatedTapdDocument(
		pi,
		{
			open: async () => ({ status: "unavailable", error: "offline" }),
		} as never,
		ctx as never,
		snapshot!,
	);
	assert.match(notifies.at(-1) ?? "", /已回退终端/);

	const cancelled = {
		...ctx,
		ui: {
			...ctx.ui,
			async select() {
				return undefined;
			},
		},
	};
	const before = notifies.length;
	await previewTapdDocument(
		pi,
		{ open: async () => ({ status: "closed" }) } as never,
		cancelled as never,
	);
	assert.equal(notifies.length, before);

	const withFile = {
		...ctx,
		sessionManager: {
			getEntries: () => [
				{
					type: "custom",
					customType: TAPD_SESSION_STATE_TYPE,
					data: { ...state, understandingFile: understanding },
				},
			],
		},
	};
	const design = await snapshotTapdDocument(withFile as never, "collaboration");
	assert.match(design?.path ?? "", /collaboration\.md/);
});
