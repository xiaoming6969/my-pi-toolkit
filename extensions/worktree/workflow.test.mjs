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

function hasUpstream(cwd) {
	try {
		gitSync(cwd, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}");
		return true;
	} catch {
		return false;
	}
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
	assert.equal(hasUpstream(path), false);

	await removeGitWorktree(git, root, path, false);
	assert.equal(existsSync(path), false);
});

test("create from origin/dev does not set upstream", async () => {
	const root = fixture();
	const remote = mkdtempSync(join(tmpdir(), "pi-worktree-remote-"));
	gitSync(remote, "init", "--bare", "-b", "dev");
	gitSync(root, "branch", "-M", "dev");
	gitSync(root, "remote", "add", "origin", remote);
	gitSync(root, "push", "-u", "origin", "dev");
	const branch = "feature/story-1";
	const path = defaultWorktreePath(root, branch);

	await createGitWorktree({ git, root, branch, baseRef: "origin/dev", path });

	assert.equal(gitSync(path, "branch", "--show-current"), branch);
	assert.equal(hasUpstream(path), false);
});

test("apply refuses to overwrite a dirty original checkout", async () => {
	const root = fixture();
	const branch = "worktree/dirty-original";
	const path = defaultWorktreePath(root, branch);
	await createGitWorktree({ git, root, branch, baseRef: "HEAD", path });
	writeFileSync(join(path, "tracked.txt"), "worktree\n");
	writeFileSync(join(root, "original.txt"), "dirty\n");

	await assert.rejects(
		() => applyGitWorktree({ git, originalCwd: root, worktreePath: path, worktreeBranch: branch }),
		/原工作目录有未提交改动/,
	);
	assert.equal(readFileSync(join(path, "tracked.txt"), "utf8"), "worktree\n");
	assert.equal(readFileSync(join(root, "original.txt"), "utf8"), "dirty\n");
	assert.equal(gitSync(root, "branch", "--show-current"), "main");
	assert.equal(existsSync(path), true);
});

test("apply switches original checkout to the worktree branch and deletes the worktree", async () => {
	const root = fixture();
	gitSync(root, "commit", "--allow-empty", "-m", "later");
	const branch = "feature/story-1";
	const path = defaultWorktreePath(root, branch);
	await createGitWorktree({ git, root, branch, baseRef: "HEAD~", path });
	writeFileSync(join(path, "tracked.txt"), "worktree\n");
	writeFileSync(join(path, "extra.txt"), "new\n");

	const result = await applyGitWorktree({
		git,
		originalCwd: root,
		worktreePath: path,
		worktreeBranch: branch,
	});

	assert.equal(result.moved, true);
	assert.equal(existsSync(path), false);
	assert.equal(gitSync(root, "branch", "--show-current"), branch);
	assert.equal(readFileSync(join(root, "tracked.txt"), "utf8"), "worktree\n");
	assert.equal(readFileSync(join(root, "extra.txt"), "utf8"), "new\n");
});

test("abandon leaves the original branch unchanged", async () => {
	const root = fixture();
	const branch = "feature/story-1";
	const path = defaultWorktreePath(root, branch);
	await createGitWorktree({ git, root, branch, baseRef: "HEAD", path });
	writeFileSync(join(path, "tracked.txt"), "worktree\n");

	await removeGitWorktree(git, root, path, true);

	assert.equal(existsSync(path), false);
	assert.equal(gitSync(root, "branch", "--show-current"), "main");
	assert.equal(readFileSync(join(root, "tracked.txt"), "utf8"), "base\n");
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
