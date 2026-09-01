import { normalizeRepoPath } from "./git.js";
import type {
	GitContext,
	MismatchKind,
	SessionBranchBinding,
} from "./types.js";

function sameRepo(
	binding: SessionBranchBinding,
	repoRoot: string,
	gitCommonDir?: string,
): boolean {
	if (normalizeRepoPath(repoRoot) === normalizeRepoPath(binding.repoRoot))
		return true;
	if (!gitCommonDir || !binding.gitCommonDir) return false;
	return (
		normalizeRepoPath(gitCommonDir) ===
		normalizeRepoPath(binding.gitCommonDir)
	);
}

/**
 * 纯比较：binding 与当前 Git 上下文是否一致。
 * - 无 binding：视为一致（由生命周期负责首次绑定）。
 * - 非 Git 目录：视为一致（功能静默禁用）。
 * - 仓库根与 git common dir 都不同：repo-differs。
 * - 当前 detached HEAD：detached。
 * - branch 不同：branch-differs。
 */
export function compareBinding(
	binding: SessionBranchBinding | undefined,
	gitContext: GitContext,
): MismatchKind {
	if (!binding) return "same";
	if (!gitContext.isRepo || !gitContext.repoRoot) return "same";
	if (!sameRepo(binding, gitContext.repoRoot, gitContext.gitCommonDir))
		return "repo-differs";
	if (!gitContext.branch) return "detached";
	if (gitContext.branch !== binding.gitBranch) return "branch-differs";
	return "same";
}
