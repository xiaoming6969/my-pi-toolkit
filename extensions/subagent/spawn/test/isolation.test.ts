import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
	createSubagentWorktree,
	describeWorktree,
	worktreeBranchName,
} from "../isolation.ts";

const execFileAsync = promisify(execFile);
const gitRun = async (cwd: string, args: string[]) =>
	(await execFileAsync("git", args, { cwd })).stdout.trim();

async function initRepo(t: { after(fn: () => unknown): void }) {
	const root = await mkdtemp(join(tmpdir(), "iso-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await gitRun(root, ["init", "-q", "-b", "main"]);
	await gitRun(root, ["config", "user.email", "t@example.com"]);
	await gitRun(root, ["config", "user.name", "t"]);
	await writeFile(join(root, "a.txt"), "a");
	await gitRun(root, ["add", "."]);
	await gitRun(root, ["commit", "-q", "-m", "init"]);
	return root;
}

test("worktree branch name derives from the subagent id", () => {
	assert.equal(worktreeBranchName("0123456789abcdef"), "subagent/01234567");
});

test("createSubagentWorktree adds a sibling worktree on a fresh branch", async (t) => {
	const root = await initRepo(t);
	const worktree = await createSubagentWorktree(root, "abcdef0123", gitRun);
	t.after(() => rm(worktree.path, { recursive: true, force: true }));
	assert.equal(worktree.root, await gitRun(root, ["rev-parse", "--show-toplevel"]));
	assert.equal(worktree.branch, "subagent/abcdef01");
	assert.ok(existsSync(join(worktree.path, "a.txt")));
	assert.equal(await gitRun(worktree.path, ["branch", "--show-current"]), "subagent/abcdef01");
	assert.equal(await gitRun(root, ["branch", "--show-current"]), "main");
	const text = describeWorktree(worktree);
	assert.match(text, /Worktree: .* \(branch subagent\/abcdef01/);
	assert.match(text, /git -C .* merge subagent\/abcdef01/);
	assert.match(text, /worktree remove --force/);
});

test("createSubagentWorktree rejects directories outside a git repository", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "iso-plain-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	await assert.rejects(createSubagentWorktree(dir, "id", gitRun), /需要 Git 仓库/);
});
