import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	applyGitWorktree,
	createGitWorktree,
	defaultWorktreePath,
	gitStatus,
	removeGitWorktree,
} from "./operations.ts";

function gitSync(cwd, ...args) {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

const git = async (cwd, args) => gitSync(cwd, ...args);

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "pi-worktree-"));
	gitSync(root, "init", "-b", "main");
	gitSync(root, "config", "user.email", "test@example.com");
	gitSync(root, "config", "user.name", "Test User");
	writeFileSync(join(root, "tracked.txt"), "base\n");
	gitSync(root, "add", ".");
	gitSync(root, "commit", "-m", "initial");
	return root;
}

test("create leaves current changes in the original checkout", async () => {
	const root = fixture();
	const branch = "worktree/test";
	const path = defaultWorktreePath(root, branch);
	writeFileSync(join(root, "tracked.txt"), "changed\n");
	writeFileSync(join(root, "untracked.txt"), "new\n");

	await createGitWorktree({ git, root, branch, baseRef: "HEAD", path });

	assert.equal(gitSync(root, "branch", "--show-current"), "main");
	assert.match(await gitStatus(git, root), /tracked\.txt/);
	assert.match(await gitStatus(git, root), /untracked\.txt/);
	assert.equal(readFileSync(join(root, "tracked.txt"), "utf8"), "changed\n");
	assert.equal(readFileSync(join(root, "untracked.txt"), "utf8"), "new\n");
	assert.equal(readFileSync(join(path, "tracked.txt"), "utf8"), "base\n");
	assert.equal(existsSync(join(path, "untracked.txt")), false);
	assert.equal(await gitStatus(git, path), "");

	await removeGitWorktree(git, root, path, false);
	assert.equal(existsSync(path), false);
});

test("apply refuses to overwrite a dirty original checkout", async () => {
	const root = fixture();
	const branch = "worktree/dirty-original";
	const path = defaultWorktreePath(root, branch);
	await createGitWorktree({ git, root, branch, baseRef: "HEAD", path });
	writeFileSync(join(path, "tracked.txt"), "worktree\n");
	writeFileSync(join(root, "original.txt"), "dirty\n");

	await assert.rejects(
		() => applyGitWorktree(git, root, path),
		/原工作目录有未提交改动/,
	);
	assert.equal(readFileSync(join(path, "tracked.txt"), "utf8"), "worktree\n");
	assert.equal(readFileSync(join(root, "original.txt"), "utf8"), "dirty\n");
});

test("force removal deletes a dirty worktree", async () => {
	const root = fixture();
	const branch = "worktree/force-delete";
	const path = defaultWorktreePath(root, branch);
	await createGitWorktree({ git, root, branch, baseRef: "HEAD", path });
	writeFileSync(join(path, "tracked.txt"), "dirty\n");

	await removeGitWorktree(git, root, path, true);
	assert.equal(existsSync(path), false);
});
