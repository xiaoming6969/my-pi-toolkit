import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { BrowserReviewManager } from "../browser-review/server.js";
import { withWorking } from "../shared/tui/working-cancel.js";
import { readPlanFile, type SessionPlanFile } from "./plan-file.js";
import type { ChatMode } from "./state.js";

interface PlanCommandOptions {
	getMode: () => ChatMode;
	getPlan: () => SessionPlanFile | undefined;
	enterPlan: (ctx: ExtensionCommandContext) => Promise<unknown>;
	setBrowserReviewEnabled: (enabled: boolean) => void;
}

const COMPLETIONS: AutocompleteItem[] = [
	{
		value: "review",
		label: "review",
		description: "再次打开当前 session 的 Plan 浏览器审阅",
	},
];

async function reviewPlan(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	reviews: BrowserReviewManager,
	plan: SessionPlanFile | undefined,
): Promise<void> {
	if (!plan) {
		ctx.ui.notify("Session Plan 路径尚未初始化。", "warning");
		return;
	}
	const content = await readPlanFile(plan);
	if (!content) {
		ctx.ui.notify("当前 session 尚无可查看的 Plan。", "warning");
		return;
	}
	const result = await withWorking(
		ctx,
		"plan-review",
		async (working) => {
			working?.setMessage("Working... 正在准备 Plan 审阅");
			const { textReviewSource } = await import("../browser-review/sources.js");
			const source = await textReviewSource(
				"document",
				"PLAN REVIEW",
				content,
				plan.absolutePath,
			);
			working?.throwIfAborted();
			working?.dispose();
			return reviews.open(source);
		},
		{ message: "Working... 正在准备 Plan 审阅", notifyAbort: true },
	);
	if (!result) return;
	if (result.status === "feedback") {
		const prompt = `请按以下用户浏览器批注继续修改本 session 的 Plan：${plan.absolutePath}\n\n${result.feedback}`;
		if (ctx.isIdle()) pi.sendUserMessage(prompt);
		else pi.sendUserMessage(prompt, { deliverAs: "followUp" });
	} else if (result.status === "unavailable") {
		ctx.ui.notify(`浏览器审阅不可用，已回退终端：${result.error}`, "warning");
		await withWorking(
			ctx,
			"plan-review",
			async (working) => {
				working?.setMessage("Working... 正在打开终端审批");
				const { showPlanDialog } = await import("./plan-dialog.js");
				working?.dispose();
				await showPlanDialog(ctx, plan.absolutePath, content);
			},
			{ message: "Working... 正在打开终端审批", notifyAbort: true },
		);
	}
}

export function registerPlanCommand(
	pi: ExtensionAPI,
	options: PlanCommandOptions,
	reviews: BrowserReviewManager,
): void {
	pi.registerCommand("plan", {
		description: "进入 Plan Mode；使用 /plan review 再次查看方案",
		getArgumentCompletions: (prefix: string) => {
			const normalized = prefix.trim().toLowerCase();
			return COMPLETIONS.filter((item) => item.value.startsWith(normalized));
		},
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const action = args.trim().toLowerCase();
			if (action === "review") {
				await reviewPlan(pi, ctx, reviews, options.getPlan());
				return;
			}
			if (!ctx.isIdle()) {
				ctx.ui.notify(
					"请等待当前 Agent 运行结束后再执行 Plan 命令。",
					"warning",
				);
				return;
			}
			if (action) {
				ctx.ui.notify("用法：/plan 或 /plan review", "warning");
				return;
			}
			if (options.getMode() === "plan") {
				ctx.ui.notify("已在 Plan 模式。", "info");
				return;
			}
			await options.enterPlan(ctx);
		},
	});

	pi.registerCommand("browser", {
		description: "设置 Plan 完成后使用浏览器或终端审批",
		getArgumentCompletions: (prefix: string) =>
			["on", "off"]
				.filter((value) => value.startsWith(prefix.trim().toLowerCase()))
				.map((value) => ({ value, label: value })),
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const action = args.trim().toLowerCase();
			if (action !== "on" && action !== "off") {
				ctx.ui.notify("用法：/browser on 或 /browser off", "warning");
				return;
			}
			const enabled = action === "on";
			options.setBrowserReviewEnabled(enabled);
			ctx.ui.notify(
				`Plan 完成后将使用${enabled ? "浏览器" : "终端"}审批。`,
				"info",
			);
		},
	});
}
