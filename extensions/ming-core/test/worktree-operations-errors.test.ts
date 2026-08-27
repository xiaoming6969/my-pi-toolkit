import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
	applyGitWorktree,
	createGitWorktree,
	defaultWorktreePath,
} from "../worktree/operations.ts";

test("createGitWorktree rejects an existing directory", async () => {
	const path = mkdtempSync(join(tmpdir(), "pi-wt-exists-"));
	await assert.rejects(
		() =>
			createGitWorktree({
				git: async () => "",
				root: "/repo",
				branch: "feature",
				baseRef: "HEAD",
				path,
			}),
		/worktree 目录已存在/,
	);
});

test("applyGitWorktree reports stash-aware failures", async () => {
	const git = async (cwd: string, args: string[]) => {
		if (args[0] === "status") return cwd === "/wt" ? "M file" : "";
		if (args[0] === "stash" && args[1] === "push") return "";
		if (args[0] === "worktree") throw new Error("remove failed");
		return "";
	};
	await assert.rejects(
		() =>
			applyGitWorktree({
				git,
				originalCwd: "/orig",
				worktreePath: "/wt",
				worktreeBranch: "feature",
			}),
		/已暂存工作夹改动，但删除工作夹失败/,
	);
});

test("applyGitWorktree reports switch failures after a successful remove", async () => {
	const git = async (cwd: string, args: string[]) => {
		if (args[0] === "status") return cwd === "/orig" ? "" : "M file";
		if (args[0] === "stash" && args[1] === "push") return "";
		if (args[0] === "worktree") return "";
		if (args[0] === "switch") throw new Error("switch failed");
		return "";
	};
	await assert.rejects(
		() =>
			applyGitWorktree({
				git,
				originalCwd: "/orig",
				worktreePath: "/wt",
				worktreeBranch: "feature",
			}),
		/无法切到 feature/,
	);
});

test("applyGitWorktree keeps a warning when stash pop conflicts", async () => {
	const git = async (cwd: string, args: string[]) => {
		if (args[0] === "status") return cwd === "/orig" ? "" : "M file";
		if (args[0] === "stash" && args[1] === "push") return "";
		if (args[0] === "stash" && args[1] === "pop") throw new Error("conflict");
		return "";
	};
	const result = await applyGitWorktree({
		git,
		originalCwd: "/orig",
		worktreePath: "/wt",
		worktreeBranch: "feature",
	});
	assert.equal(result.moved, true);
	assert.match(result.applyWarning ?? "", /未提交改动发生冲突/);
});

test("applyGitWorktree without local changes surfaces the raw git error", async () => {
	const git = async (_cwd: string, args: string[]) => {
		if (args[0] === "status") return "";
		if (args[0] === "worktree") throw "remove exploded";
		return "";
	};
	await assert.rejects(
		() =>
			applyGitWorktree({
				git,
				originalCwd: "/orig",
				worktreePath: "/wt",
				worktreeBranch: "feature",
			}),
		/remove exploded/,
	);
});

test("applyGitWorktree reports a clean switch failure without a stash", async () => {
	const git = async (_cwd: string, args: string[]) => {
		if (args[0] === "status") return "";
		if (args[0] === "switch") throw "switch exploded";
		return "";
	};
	await assert.rejects(
		() =>
			applyGitWorktree({
				git,
				originalCwd: "/orig",
				worktreePath: "/wt",
				worktreeBranch: "feature",
			}),
		/switch exploded/,
	);
});

test("createGitWorktree uses the default path when omitted", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-wt-root-"));
	const branch = "feat/story 1";
	const path = defaultWorktreePath(root, branch);
	await createGitWorktree({
		git: async () => "",
		root,
		branch,
		baseRef: "HEAD",
	});
	assert.equal(existsSync(dirname(path)), true);
	assert.match(path, /feat-story-1$/);
});
