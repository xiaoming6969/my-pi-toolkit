import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { WorkingCancel } from "../../shared/tui/working-cancel.js";
import {
	applyWorktree,
	createWorktree,
	deleteWorktree,
} from "./workflow.js";

async function run(
	ctx: ExtensionCommandContext,
	key: string,
	message: string,
	action: (working: WorkingCancel | undefined) => Promise<string>,
	notify: boolean,
): Promise<void> {
	try {
		await ctx.waitForIdle();
		const working = ctx.hasUI
			? new WorkingCancel(ctx, key, { cancellable: false, message })
			: undefined;
		try {
			const result = await action(working);
			if (notify) ctx.ui.notify(result, "info");
		} finally {
			working?.dispose();
		}
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
	}
}

export default function worktreeExtension(pi: ExtensionAPI): void {
	pi.registerCommand("new-worktree", {
		description: "创建干净的 worktree，并将当前会话切入该目录",
		handler: async (_args, ctx) =>
			run(
				ctx,
				"worktree-new",
				"new worktree...",
				(working) => createWorktree(pi, ctx, working),
				false,
			),
	});
	pi.registerCommand("apply-worktree", {
		description: "应用 worktree：原项目切到该分支并迁回未提交改动，删除工作夹并切回会话",
		handler: async (_args, ctx) =>
			run(
				ctx,
				"worktree-apply",
				"apply worktree...",
				(working) => applyWorktree(pi, ctx, working),
				false,
			),
	});
	pi.registerCommand("delete-worktree", {
		description: "放弃 worktree：删除工作夹，原项目分支不变；会话在工作夹时一并切回",
		handler: async (_args, ctx) =>
			run(
				ctx,
				"worktree-delete",
				"delete working...",
				(working) => deleteWorktree(pi, ctx, working),
				true,
			),
	});
}
