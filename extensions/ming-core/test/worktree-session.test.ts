import test from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	appendWorktreeBinding,
	assertCanBindWorktree,
	isWorktreeBinding,
	readWorktreeBinding,
} from "../worktree/session.ts";
import { WORKTREE_BINDING_TYPE, type WorktreeBinding } from "../worktree/types.ts";

const binding: WorktreeBinding = {
	version: 1,
	originalCwd: "/repo",
	originalBranch: "main",
	worktreePath: "/repo/.pi/worktrees/feature",
	worktreeBranch: "feature",
	baseRef: "HEAD",
	phase: "active",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

test("isWorktreeBinding requires version, paths, and a known phase", () => {
	assert.equal(isWorktreeBinding(null), false);
	assert.equal(isWorktreeBinding({ ...binding, version: 2 }), false);
	assert.equal(isWorktreeBinding({ ...binding, phase: "pending" }), false);
	assert.equal(isWorktreeBinding(binding), true);
});

test("readWorktreeBinding keeps the last intact snapshot", () => {
	const entries = [
		{ type: "message" },
		{
			type: "custom",
			customType: WORKTREE_BINDING_TYPE,
			data: { version: 1 },
		},
		{
			type: "custom",
			customType: WORKTREE_BINDING_TYPE,
			data: binding,
		},
		{
			type: "custom",
			customType: WORKTREE_BINDING_TYPE,
			data: { ...binding, phase: "applied" },
		},
	] as SessionEntry[];
	assert.equal(readWorktreeBinding([]), undefined);
	assert.equal(readWorktreeBinding(entries)?.phase, "applied");
});

test("assertCanBindWorktree rejects temporary sessions", () => {
	assert.throws(
		() =>
			assertCanBindWorktree({
				sessionManager: { getSessionDir: () => undefined },
			} as never),
		/临时会话无法绑定 worktree/,
	);
	assert.doesNotThrow(() =>
		assertCanBindWorktree({
			sessionManager: { getSessionDir: () => "/tmp/sessions" },
		} as never),
	);
});

test("appendWorktreeBinding stamps version 1 and updatedAt", () => {
	const written: unknown[] = [];
	const saved = appendWorktreeBinding(
		{
			appendEntry: (_type: string, data: unknown) => written.push(data),
		} as ExtensionAPI,
		{
			originalCwd: "/repo",
			originalBranch: "main",
			worktreePath: "/wt",
			worktreeBranch: "feature",
			baseRef: "HEAD",
			phase: "active",
		},
	);
	assert.equal(saved.version, 1);
	assert.equal(typeof saved.updatedAt, "string");
	assert.deepEqual(written, [saved]);
});
