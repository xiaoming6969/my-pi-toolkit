import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
	applyWorktree,
	createWorktree,
	deleteWorktree,
} from "./workflow.js";

async function run(
	ctx: ExtensionCommandContext,
	action: () => Promise<string>,
): Promise<void> {
	try {
		await ctx.waitForIdle();
		ctx.ui.notify(await action(), "info");
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
	}
}

async function runSwitch(
	ctx: ExtensionCommandContext,
	action: () => Promise<string>,
): Promise<void> {
	try {
		await ctx.waitForIdle();
		await action();
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
	}
}

export default function worktreeExtension(pi: ExtensionAPI): void {
	pi.registerCommand("new-worktree", {
		description: "创建 worktree，并将当前改动和会话迁入该目录",
		handler: async (_args, ctx) =>
			runSwitch(ctx, () => createWorktree(pi, ctx)),
	});
	pi.registerCommand("apply-worktree", {
		description: "将 worktree 改动迁回原目录，并切回当前会话",
		handler: async (_args, ctx) =>
			runSwitch(ctx, () => applyWorktree(pi, ctx)),
	});
	pi.registerCommand("delete-worktree", {
		description: "删除当前会话记录的 worktree",
		handler: async (_args, ctx) => run(ctx, () => deleteWorktree(pi, ctx)),
	});
}
