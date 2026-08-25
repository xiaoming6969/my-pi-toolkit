export const WORKTREE_BINDING_TYPE = "worktree-session-binding";

export type WorktreePhase = "active" | "applied" | "deleted";

export interface WorktreeBinding {
	version: 1;
	originalCwd: string;
	originalBranch: string;
	worktreePath: string;
	worktreeBranch: string;
	baseRef: string;
	phase: WorktreePhase;
	updatedAt: string;
}

export interface NewWorktreeTarget {
	branch: string;
	baseRef: string;
	source: "tapd" | "temporary";
}
