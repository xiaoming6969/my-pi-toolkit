import type { GitContext, MismatchKind, SessionBranchBinding } from "./types.js";

const CHECK_REASONS = new Set(["startup", "resume"]);

/** 第一条用户消息才绑定；扩展内部 sendUserMessage 不写绑定。 */
export function shouldBindOnInput(
	source: string | undefined,
	hasBinding: boolean,
): boolean {
	if (hasBinding) return false;
	return source !== "extension";
}

/** 仅在新终端打开旧会话或 resume 补偿路径检查；reload / new / fork 不弹窗。 */
export function shouldCheckSession(reason: string): boolean {
	return CHECK_REASONS.has(reason);
}

function mismatchLabel(kind: MismatchKind): string {
	if (kind === "same") return "一致";
	if (kind === "branch-differs") return "分支不一致";
	if (kind === "repo-differs") return "仓库不一致";
	return "当前 detached HEAD";
}

/** `/session-branch` 状态摘要。 */
export function formatBindingStatus(options: {
	sessionId?: string;
	binding: SessionBranchBinding | undefined;
	gitContext: GitContext;
	mismatch: MismatchKind;
}): string {
	const current = options.gitContext.branch ?? "(detached)";
	const bound = options.binding?.gitBranch ?? "(未绑定)";
	const repo = options.gitContext.repoRoot ?? "(非 Git 仓库)";
	return [
		`会话：${options.sessionId ?? "(无)"}`,
		`仓库：${repo}`,
		`绑定分支：${bound}`,
		`当前分支：${current}`,
		`状态：${mismatchLabel(options.mismatch)}`,
	].join("\n");
}
