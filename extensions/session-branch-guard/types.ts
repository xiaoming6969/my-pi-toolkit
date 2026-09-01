/** Session Branch Guard 共享类型。 */

export const BINDING_ENTRY_TYPE = "session-branch-binding";

/** 绑定来源：created=首次消息绑定，adopted=历史会话升级，rebound=用户选择继续后改绑。 */
export type BindingSource = "created" | "adopted" | "rebound";

/** 持久化在 Pi session custom entry 中的分支绑定。 */
export interface SessionBranchBinding {
	version: 1;
	/** realpath 规范化后的仓库根。 */
	repoRoot: string;
	/** symbolic 分支名；detached HEAD 不会作为普通分支写入。 */
	gitBranch: string;
	/** 记录时的 commit，仅用于诊断。 */
	head?: string;
	/** 规范化后的 git common dir；同一仓库的 worktree 与主工作区共享该值。 */
	gitCommonDir?: string;
	boundAt: string;
	source: BindingSource;
}

/** 当前工作区 Git 状态快照。 */
export interface GitContext {
	isRepo: boolean;
	repoRoot?: string;
	gitCommonDir?: string;
	/** 当前 symbolic 分支；undefined 表示 detached HEAD。 */
	branch?: string;
	head?: string;
}

/** 绑定与当前 Git 上下文的比较结果。 */
export type MismatchKind =
	| "same"
	| "repo-differs"
	| "branch-differs"
	| "detached";

export type ResolutionIntent = "switch" | "rebind" | "cancel";

export type ResolutionOutcome =
	| { kind: "switched"; toBranch: string }
	| { kind: "rebound"; branch: string }
	| { kind: "cancelled" }
	| { kind: "failed"; error: string };
