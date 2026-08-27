import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

export async function createFeatureGitRepo(
	t: Pick<TestContext, "after">,
): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "tapd-git-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
	git("init", "-b", "main");
	git("config", "user.email", "t@example.com");
	git("config", "user.name", "Test");
	git("config", "commit.gpgsign", "false");
	await writeFile(join(dir, "a.ts"), "line1\nline2\nline3\n");
	git("add", "a.ts");
	git("commit", "-m", "base --story=12@tapd-99");
	git("remote", "add", "origin", "git@gitlab.example.com:group/app.git");
	git("update-ref", "refs/remotes/origin/main", "HEAD");
	git("checkout", "-b", "feature");
	await writeFile(join(dir, "a.ts"), "line1\nchanged\nline3\n");
	git("add", "a.ts");
	git("commit", "-m", "fix --story=12@tapd-99 --user=me");
	git("update-ref", "refs/tapd/origin-tags/1.0.0", git("rev-parse", "HEAD"));
	return dir;
}
