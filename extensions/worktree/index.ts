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
		description: "创建干净的 worktree，并将当前会话切入该目录",
		handler: async (_args, ctx) =>
			runSwitch(ctx, () => createWorktree(pi, ctx)),
	});
	pi.registerCommand("apply-worktree", {
		description: "应用 worktree：原项目切到该分支并迁回未提交改动，删除工作夹并切回会话",
		handler: async (_args, ctx) =>
			runSwitch(ctx, () => applyWorktree(pi, ctx)),
	});
	pi.registerCommand("delete-worktree", {
		description: "放弃 worktree：删除工作夹，原项目分支不变；会话在工作夹时一并切回",
		handler: async (_args, ctx) => run(ctx, () => deleteWorktree(pi, ctx)),
	});
}
