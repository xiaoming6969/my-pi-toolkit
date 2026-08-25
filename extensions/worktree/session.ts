import type {
	ExtensionAPI,
	ExtensionCommandContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
	appendBindingCurrent,
	createBinding,
} from "../session-branch-guard/binding.js";
import { rewriteSessionCwd } from "./session-file.js";
import { WORKTREE_BINDING_TYPE, type WorktreeBinding } from "./types.js";

export function isWorktreeBinding(value: unknown): value is WorktreeBinding {
	if (!value || typeof value !== "object") return false;
	const b = value as Record<string, unknown>;
	return (
		b.version === 1 &&
		typeof b.originalCwd === "string" &&
		typeof b.originalBranch === "string" &&
		typeof b.worktreePath === "string" &&
		typeof b.worktreeBranch === "string" &&
		typeof b.baseRef === "string" &&
		(b.phase === "active" || b.phase === "applied" || b.phase === "deleted") &&
		typeof b.updatedAt === "string"
	);
}

export function readWorktreeBinding(
	entries: readonly SessionEntry[],
): WorktreeBinding | undefined {
	let latest: WorktreeBinding | undefined;
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== WORKTREE_BINDING_TYPE)
			continue;
		if (isWorktreeBinding(entry.data)) latest = entry.data;
	}
	return latest;
}

export function appendWorktreeBinding(
	pi: ExtensionAPI,
	binding: Omit<WorktreeBinding, "version" | "updatedAt">,
): WorktreeBinding {
	const value: WorktreeBinding = {
		...binding,
		version: 1,
		updatedAt: new Date().toISOString(),
	};
	pi.appendEntry(WORKTREE_BINDING_TYPE, value);
	return value;
}

export async function switchCurrentSessionCwd(
	ctx: ExtensionCommandContext,
	targetCwd: string,
	notifyMessage: string,
): Promise<void> {
	const sessionFile = ctx.sessionManager.getSessionFile();
	if (!sessionFile) throw new Error("临时会话无法绑定 worktree，请先保存会话");
	const oldCwd = rewriteSessionCwd(sessionFile, targetCwd);
	try {
		const result = await ctx.switchSession(sessionFile, {
			withSession: async (replacementCtx) => {
				await replacementCtx.sendMessage({
					customType: "worktree-command-result",
					content: notifyMessage,
					display: true,
				});
			},
		});
		if (result.cancelled) throw new Error("会话目录切换已取消");
	} catch (error) {
		rewriteSessionCwd(sessionFile, oldCwd);
		throw error;
	}
}

export function rebindSessionBranch(
	pi: ExtensionAPI,
	repoRoot: string,
	branch: string,
	head?: string,
): void {
	appendBindingCurrent(
		pi,
		createBinding({ isRepo: true, repoRoot, branch, head }, "rebound"),
	);
}
