import type {
	ExtensionAPI,
	ExtensionContext,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { UI_GLYPHS } from "../shared/tui/visual-language.js";
import { appendBindingTarget, createBinding } from "./binding.js";
import {
	branchExists,
	summarizeError,
	switchBranch,
} from "./git.js";
import type {
	GitContext,
	ResolutionIntent,
	ResolutionOutcome,
	SessionBranchBinding,
} from "./types.js";

export interface RebindWriter {
	write(binding: SessionBranchBinding): void;
}

export function targetRebindWriter(target: SessionManager): RebindWriter {
	return { write: (binding) => appendBindingTarget(target, binding) };
}

export function switchChoice(boundBranch: string): string {
	return `${UI_GLYPHS.action} 切换到会话分支 ${boundBranch}`;
}

export function continueChoice(currentBranch: string | undefined): string {
	if (!currentBranch) return `${UI_GLYPHS.action} 继续（当前 detached，无法改绑）`;
	return `${UI_GLYPHS.action} 继续，并把绑定改到 ${currentBranch}`;
}

export function parseResolutionChoice(
	choice: string | undefined,
): ResolutionIntent {
	if (!choice) return "cancel";
	if (choice.includes("切换到会话分支")) return "switch";
	if (choice.includes("继续")) return "rebind";
	return "cancel";
}

export function notify(
	ctx: ExtensionContext,
	message: string,
	level: "info" | "warning" | "error",
): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else process.stderr.write(`[session-branch] ${message}\n`);
}

async function attemptSwitch(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	repoRoot: string,
	targetBranch: string,
): Promise<ResolutionOutcome> {
	const exists = await branchExists(pi, repoRoot, targetBranch);
	if (!exists) {
		const error = `会话绑定分支 ${targetBranch} 不存在`;
		notify(ctx, error, "warning");
		return { kind: "failed", error };
	}
	const result = await switchBranch(pi, repoRoot, targetBranch);
	if (!result.ok) {
		const error = summarizeError(result.error);
		notify(ctx, `切换失败：${error}`, "error");
		return { kind: "failed", error };
	}
	notify(ctx, `已切换到会话分支 ${targetBranch}`, "info");
	return { kind: "switched", toBranch: targetBranch };
}

/**
 * 分支不一致时的二选一：切回绑定分支，或留在当前分支并改绑。
 * Esc / 取消不改 Git、不改绑定。
 */
export async function resolveBranchMismatch(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	binding: SessionBranchBinding,
	gitContext: GitContext,
	writer: RebindWriter,
): Promise<ResolutionOutcome> {
	if (!gitContext.isRepo || !gitContext.repoRoot) {
		const error = "当前目录不是 Git 仓库，无法处理分支不匹配";
		notify(ctx, error, "error");
		return { kind: "failed", error };
	}

	const choice = await ctx.ui.select(
		`会话绑定分支 ${binding.gitBranch}，当前在 ${gitContext.branch ?? "(detached)"}`,
		[switchChoice(binding.gitBranch), continueChoice(gitContext.branch)],
	);
	const intent = parseResolutionChoice(choice);
	if (intent === "cancel") return { kind: "cancelled" };

	if (intent === "rebind") {
		if (!gitContext.branch) {
			const error = "当前处于 detached HEAD，无法改绑；请先切换到命名分支";
			notify(ctx, error, "warning");
			return { kind: "failed", error };
		}
		const rebound = createBinding(gitContext, "rebound");
		try {
			writer.write(rebound);
		} catch (error) {
			const message = `重新绑定失败：${error instanceof Error ? error.message : String(error)}`;
			notify(ctx, message, "error");
			return { kind: "failed", error: message };
		}
		notify(ctx, `会话已重新绑定到当前分支 ${gitContext.branch}`, "info");
		return { kind: "rebound", branch: gitContext.branch };
	}

	return attemptSwitch(pi, ctx, gitContext.repoRoot, binding.gitBranch);
}
