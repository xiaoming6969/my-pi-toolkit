import {
	createGitWorktree,
	defaultWorktreePath,
	type GitRun,
} from "../../ming-core/worktree/operations.js";
import { git } from "../../tapd/git/repository.js";

export type SpawnIsolation = "none" | "worktree";

export interface SubagentWorktree {
	root: string;
	branch: string;
	path: string;
}

const runGit: GitRun = (cwd, args) => git(cwd, args);

export function worktreeBranchName(subagentId: string): string {
	return `subagent/${subagentId.slice(0, 8)}`;
}

/**
 * Give a writing child its own git worktree so its edits never collide with
 * the parent's working tree. The worktree is left in place after the run; the
 * parent decides whether to merge or discard it.
 */
export async function createSubagentWorktree(
	cwd: string,
	subagentId: string,
	gitRun: GitRun = runGit,
): Promise<SubagentWorktree> {
	let root: string;
	try {
		root = await gitRun(cwd, ["rev-parse", "--show-toplevel"]);
	} catch {
		throw new Error(`isolation: worktree 需要 Git 仓库，${cwd} 不在仓库内`);
	}
	const branch = worktreeBranchName(subagentId);
	const path = defaultWorktreePath(root, branch);
	await createGitWorktree({ git: gitRun, root, branch, baseRef: "HEAD", path });
	return { root, branch, path };
}

export function describeWorktree(worktree: SubagentWorktree): string {
	return [
		"",
		"",
		`Worktree: ${worktree.path} (branch ${worktree.branch}, base ${worktree.root})`,
		`Review with: git -C ${worktree.root} diff HEAD...${worktree.branch}`,
		`Integrate with: git -C ${worktree.root} merge ${worktree.branch}`,
		`Discard with: git -C ${worktree.root} worktree remove --force ${worktree.path} && git -C ${worktree.root} branch -D ${worktree.branch}`,
	].join("\n");
}
