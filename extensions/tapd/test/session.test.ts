import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	getCollaborationDocPath,
	getDesignDocPath,
	getUnderstandingDocPath,
	safeRequirementDirName,
} from "../sessions/docs.ts";
import { deleteSessionFile, readSessionTitle } from "../sessions/session-files.ts";
import {
	appendTapdSessionState,
	isValidTapdSessionState,
	readTapdSessionState,
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

test("safeRequirementDirName sanitizes Windows-illegal names", () => {
	assert.equal(safeRequirementDirName('  a<>:"/\\|?*b.  '), "a_________b");
	assert.equal(safeRequirementDirName("   "), "未命名需求");
	assert.equal(safeRequirementDirName("x".repeat(200)).length, 120);
});

test("TAPD doc paths nest under .pi/docs", () => {
	assert.equal(
		getUnderstandingDocPath("/repo", "story-1"),
		join("/repo", ".pi", "docs", "story-1", "understanding.md"),
	);
	assert.equal(
		getDesignDocPath("/repo", "story-1"),
		join("/repo", ".pi", "docs", "story-1", "design.md"),
	);
	assert.equal(
		getCollaborationDocPath("/repo", "story-1"),
		join("/repo", ".pi", "docs", "story-1", "collaboration.md"),
	);
});

test("session state validation keeps the last intact snapshot", () => {
	assert.equal(isValidTapdSessionState(null), false);
	assert.equal(isValidTapdSessionState({ ...state, version: 2 }), false);
	assert.equal(isValidTapdSessionState(state), true);
	const entries = [
		{ type: "message" },
		{
			type: "custom",
			customType: TAPD_SESSION_STATE_TYPE,
			data: { version: 1 },
		},
		{
			type: "custom",
			customType: TAPD_SESSION_STATE_TYPE,
			data: state,
		},
		{
			type: "custom",
			customType: TAPD_SESSION_STATE_TYPE,
			data: { ...state, itemName: "更新" },
		},
	] as SessionEntry[];
	assert.equal(readTapdSessionState(entries)?.itemName, "更新");

	const written: unknown[] = [];
	appendTapdSessionState(
		{ appendEntry: (_type, data) => written.push(data) } as ExtensionAPI,
		state,
	);
	assert.deepEqual(written, [state]);
});

test("readSessionTitle scans JSONL backwards and delete reports missing files", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "tapd-session-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const file = join(root, "session.jsonl");
	assert.equal(readSessionTitle(file), null);
	await mkdir(root, { recursive: true });
	await writeFile(
		file,
		[
			"{",
			JSON.stringify({ type: "session_info", name: "old" }),
			JSON.stringify({ type: "message" }),
			JSON.stringify({ type: "session_info", name: "latest" }),
			"",
		].join("\n"),
	);
	assert.equal(readSessionTitle(file), "latest");
	assert.deepEqual(deleteSessionFile(join(root, "missing.jsonl")), {
		ok: true,
		method: "missing",
	});
});
