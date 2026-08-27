import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { extractLocateReason } from "../documents/bug-reject-reason.ts";
import {
	isTapdDocumentKind,
	snapshotTapdDocument,
} from "../documents/preview.ts";
import {
	buildBugContextPrompt,
	buildUnderstandPrompt,
} from "../documents/prompts.ts";
import { getUnderstandingDocPath } from "../sessions/docs.ts";
import {
	TAPD_SESSION_STATE_TYPE,
	type TapdSessionState,
} from "../sessions/session-state.ts";

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
	assert.match(bug, /执行 \/tapd bug/);
});
