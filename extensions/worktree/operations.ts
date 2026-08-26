import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export type GitRun = (cwd: string, args: string[]) => Promise<string>;

export function defaultWorktreePath(root: string, branch: string): string {
	const safeBranch = branch.replace(/[^a-zA-Z0-9._-]+/g, "-");
	return join(dirname(root), `${basename(root)}-worktrees`, safeBranch);
}

export async function gitStatus(git: GitRun, cwd: string): Promise<string> {
	return git(cwd, ["status", "--porcelain", "--untracked-files=normal"]);
}

async function stash(git: GitRun, cwd: string, message: string): Promise<boolean> {
	if (!(await gitStatus(git, cwd))) return false;
	await git(cwd, ["stash", "push", "--include-untracked", "-m", message]);
	return true;
}

async function popStash(git: GitRun, cwd: string): Promise<void> {
	await git(cwd, ["stash", "pop", "stash@{0}"]);
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function createGitWorktree(options: {
	git: GitRun;
	root: string;
	branch: string;
	baseRef: string;
	path?: string;
}): Promise<void> {
	const { git, root, branch, baseRef } = options;
	const path = options.path ?? defaultWorktreePath(root, branch);
	if (existsSync(path)) throw new Error(`worktree 目录已存在: ${path}`);
	mkdirSync(dirname(path), { recursive: true });
	await git(root, ["worktree", "add", "--no-track", "-b", branch, path, baseRef]);
}

export async function applyGitWorktree(options: {
	git: GitRun;
	originalCwd: string;
	worktreePath: string;
	worktreeBranch: string;
}): Promise<{ moved: boolean; applyWarning?: string }> {
	const { git, originalCwd, worktreePath, worktreeBranch } = options;
	if (await gitStatus(git, originalCwd))
		throw new Error("原工作目录有未提交改动，请先处理后再 apply");
	const moved = await stash(git, worktreePath, "pi apply-worktree");
	try {
		await removeGitWorktree(git, originalCwd, worktreePath, false);
	} catch (error) {
		throw new Error(
			moved
				? `已暂存工作夹改动，但删除工作夹失败。stash 已保留，可用 git stash apply 恢复。${errorText(error)}`
				: errorText(error),
		);
	}
	try {
		await git(originalCwd, ["switch", worktreeBranch]);
	} catch (error) {
		throw new Error(
			moved
				? `工作夹已删除，但无法切到 ${worktreeBranch}。stash 已保留，可用 git stash apply 恢复。${errorText(error)}`
				: errorText(error),
		);
	}
	if (!moved) return { moved };
	try {
		await popStash(git, originalCwd);
		return { moved };
	} catch (error) {
		return {
			moved,
			applyWarning: `已切到 ${worktreeBranch}，但未提交改动发生冲突；stash 已保留，请在原目录解决。${errorText(error)}`,
		};
	}
}

export async function removeGitWorktree(
	git: GitRun,
	originalCwd: string,
	worktreePath: string,
	force: boolean,
): Promise<void> {
	await git(originalCwd, [
		"worktree",
		"remove",
		...(force ? ["--force"] : []),
		worktreePath,
	]);
	await git(originalCwd, ["worktree", "prune"]);
}
