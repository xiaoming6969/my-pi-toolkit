import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatReviewFeedback } from "../browser-review/feedback.js";
import type { BrowserReviewManager } from "../browser-review/server.js";
import { textReviewSource } from "../browser-review/sources.js";
import { showPlanDialog } from "./plan-dialog.js";

export type PlanApprovalDecision =
	| "implement"
	| "defer"
	| "revise"
	| "abandon"
	| "closed";

export interface PlanApprovalResult {
	decision: PlanApprovalDecision;
	feedback?: string;
}

export async function requestPlanApproval(
	ctx: ExtensionContext,
	reviews: BrowserReviewManager,
	planPath: string,
	planContent: string | undefined,
): Promise<PlanApprovalResult> {
	if (!ctx.hasUI) return { decision: "implement" };

	const source = textReviewSource(
		"plan",
		"PLAN REVIEW",
		planContent ?? "",
		planPath,
	);
	const browser = await reviews.open(source, { signal: ctx.signal });
	if (browser.status === "approved") {
		return {
			decision: "implement",
			feedback: browser.annotations.length
				? formatReviewFeedback(source, browser.annotations)
				: undefined,
		};
	}
	if (browser.status === "deferred") return { decision: "defer" };
	if (browser.status === "abandoned") return { decision: "abandon" };
	if (browser.status === "feedback") {
		return { decision: "revise", feedback: browser.feedback || undefined };
	}
	if (browser.status === "closed") return { decision: "closed" };

	ctx.ui.notify(`浏览器审阅不可用，已回退终端：${browser.error}`, "warning");
	await showPlanDialog(ctx, planPath, planContent);
	const choice = await ctx.ui.select(`PLAN APPROVAL · ${planPath}`, [
		"批准并实现",
		"批准但暂不实现",
		"继续编辑",
		"取消计划",
	]);
	if (choice === "批准并实现") return { decision: "implement" };
	if (choice === "批准但暂不实现") return { decision: "defer" };
	if (choice === "取消计划") return { decision: "abandon" };
	if (choice !== "继续编辑") return { decision: "revise" };

	const note = await ctx.ui.editor("希望计划如何修改？", "");
	return { decision: "revise", feedback: note?.trim() || undefined };
}
