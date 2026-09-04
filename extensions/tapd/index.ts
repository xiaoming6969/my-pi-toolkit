/** TAPD extension entry point. */

import type {
	AgentSettledEvent,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { BrowserReviewManager } from "../browser-review/server.js";
import { tapdArgumentCompletions } from "./command-completions.js";
import { loadConfig } from "./core/config.js";
import type { TapdDocumentSnapshot } from "./documents/preview.js";
import { registerTapdGitMessageRenderer } from "./git/message-renderer.js";
import { registerTapdReviewTool } from "./review/register.js";
import { withTapdWorking } from "./working.js";

export default function tapdExtension(pi: ExtensionAPI) {
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
			void import("./documents/preview.js")
				.then(({ previewUpdatedTapdDocument }) =>
					previewUpdatedTapdDocument(pi, documentReviews, ctx, preview),
				)
				.catch((error: unknown) => {
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
			await withTapdWorking(
				ctx,
				"tapd",
				async (working) => {
					working?.setMessage("Working... 正在加载 TAPD");
					const { handleTapdCommand } = await import("./command-handler.js");
					await handleTapdCommand(
						pi,
						args,
						ctx,
						documentReviews,
						(preview) => {
							pendingPreview = preview;
						},
						working,
					);
				},
				{ message: "Working... 正在加载 TAPD" },
			);
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
			await withTapdWorking(
				ctx,
				"tapd",
				async (working) => {
					working?.setMessage("Working... 正在加载 TAPD");
					const { openTapdTodoList } = await import("./todo/open.js");
					await openTapdTodoList(
						ctx as ExtensionCommandContext,
						config,
						true,
						working,
					);
				},
				{ message: "Working... 正在加载 TAPD" },
			);
		},
	});
}
