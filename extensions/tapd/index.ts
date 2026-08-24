/** TAPD extension entry point. */

import type {
	AgentSettledEvent,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { BrowserReviewManager } from "../browser-review/server.js";
import { tapdArgumentCompletions } from "./command-completions.js";
import { fetchUserInfo, fetchWorkspaces } from "./core/api.js";
import { loadConfig } from "./core/config.js";
import {
	handleTapdPreviewCommand,
	runTapdDocumentWorkflow,
} from "./documents/commands.js";
import { createTapdSession } from "./sessions/create.js";
import { createSubtasks } from "./subtasks/sync.js";
import { withTapdListOverlays } from "./todo/overlay-context.js";
import { showTable } from "./todo/ui.js";
import { locateTapdBug } from "./documents/workflows.js";
import { rejectTapdBug } from "./documents/bug-reject.js";
import {
	previewUpdatedTapdDocument,
	type TapdDocumentSnapshot,
} from "./documents/preview.js";
import {
	registerTapdGitMessageRenderer,
	runTapdGitCommand,
} from "./git/commands.js";
import { requestTapdReview } from "./review/command.js";
import { registerTapdReviewTool } from "./review/tool.js";
import { withTapdWorking } from "./working.js";

async function openTapdTodoList(
	ctx: ExtensionCommandContext,
	config: NonNullable<ReturnType<typeof loadConfig>>,
	initialCurrent: boolean,
): Promise<Awaited<ReturnType<typeof showTable>> | undefined> {
	return withTapdWorking(ctx, "tapd-todo-list", async (cancel) => {
		cancel?.setMessage("Working... 正在连接 TAPD");
		const user = await fetchUserInfo(config);
		cancel?.throwIfAborted();
		if (!user) {
			ctx.ui.notify("TAPD 连接失败，请检查令牌", "error");
			return undefined;
		}
		cancel?.setMessage("Working... 正在获取工作空间");
		const workspaces = await fetchWorkspaces(user.nick, config);
		cancel?.throwIfAborted();
		if (workspaces.length === 0) {
			ctx.ui.notify("没有找到工作空间", "error");
			return undefined;
		}
		cancel?.setMessage(
			`Working... 找到 ${workspaces.length} 个工作空间，正在获取待办`,
		);
		return showTable(
			withTapdListOverlays(ctx),
			config,
			workspaces,
			initialCurrent,
			cancel,
		);
	});
}

export default function tapdExtension(pi: ExtensionAPI) {
	const STATE_KEY = "tapd-view-state";
	let pendingPreview: TapdDocumentSnapshot | undefined;
	const documentReviews = new BrowserReviewManager();
	registerTapdReviewTool(pi);
	registerTapdGitMessageRenderer(pi);

	pi.on(
		"agent_settled",
		(_event: AgentSettledEvent, ctx: ExtensionContext) => {
			const preview = pendingPreview;
			pendingPreview = undefined;
			if (!preview) return;
			void previewUpdatedTapdDocument(
				pi,
				documentReviews,
				ctx,
				preview,
			).catch((error: unknown) => {
				ctx.ui.notify(
					error instanceof Error ? error.message : String(error),
					"error",
				);
			});
		},
	);
	pi.on("session_shutdown", () => documentReviews.dispose());

	pi.registerCommand("tapd", {
		description: "查看 TAPD 待办；生成需求文档或审核需求实现代码",
		getArgumentCompletions: tapdArgumentCompletions,
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const trimmedArgs = args.trim();
			const [sub = "", ...restArgs] = trimmedArgs.split(/\s+/);
			const additionalInstructions = restArgs.join(" ").trim();
			if (
				await handleTapdPreviewCommand(
					pi,
					documentReviews,
					ctx,
					sub,
					restArgs,
				)
			)
				return;

			const config = loadConfig();
			if (!config) {
				ctx.ui.notify(
					'请先配置 ~/.pi/agent/tapd.json:\n{ "token": "你的TAPD个人令牌" }',
					"error",
				);
				return;
			}
			if (await runTapdGitCommand(pi, sub, restArgs, ctx, config)) return;
			if (sub === "bug") {
				await locateTapdBug(pi, ctx, config);
				return;
			}
			if (sub === "bug-reject") {
				await rejectTapdBug(pi, ctx, config);
				return;
			}
			const documentWorkflow = await runTapdDocumentWorkflow(
				pi,
				ctx,
				sub,
				additionalInstructions,
			);
			if (documentWorkflow.handled) {
				pendingPreview = documentWorkflow.pending;
				return;
			}
			if (sub === "review") {
				await requestTapdReview(pi, ctx, restArgs);
				return;
			}
			if (sub === "sub-task") {
				await createSubtasks(pi, ctx, config);
				return;
			}

			let curOnly = true;
			const entries = ctx.sessionManager.getEntries();
			const stateEntry = entries
				.filter(
					(entry: SessionEntry) =>
						entry.type === "custom" && entry.customType === STATE_KEY,
				)
				.at(-1);
			if (stateEntry?.type === "custom") {
				const data = stateEntry.data as { currentOnly?: unknown } | undefined;
				if (typeof data?.currentOnly === "boolean") curOnly = data.currentOnly;
			}

			const outcome = await openTapdTodoList(ctx, config, curOnly);
			if (!outcome) return;
			if (outcome.kind === "session_action") {
				const { action, itemKey, itemName } = outcome;
				try {
					if (action.type === "switch") {
						await ctx.switchSession(action.sessionFile);
					} else {
						await createTapdSession(
							ctx,
							config,
							itemKey,
							itemName,
							action.draft,
						);
					}
				} catch {
					// 会话可能已替换，勿再使用旧 ctx
				}
				return;
			}
			if (outcome.saveState)
				pi.appendEntry(STATE_KEY, { currentOnly: curOnly });
		},
	});

	pi.registerShortcut("ctrl+shift+t", {
		description: "打开 TAPD 待办",
		handler: async (ctx: ExtensionContext) => {
			const config = loadConfig();
			if (!config) {
				ctx.ui.notify("请先配置 ~/.pi/agent/tapd.json", "warning");
				return;
			}
			await openTapdTodoList(ctx as ExtensionCommandContext, config, true);
		},
	});
}
