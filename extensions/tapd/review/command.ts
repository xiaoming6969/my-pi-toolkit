import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { DEFAULT_GIT_WORKFLOW_POLICY } from "../git/policy.js";
import { buildReviewDelegationMessage } from "./prompt.js";
import { resolveTapdReviewTarget } from "./resolve.js";
import type { TapdReviewScope } from "./types.js";

const REVIEW_SCOPE_OPTIONS: Record<string, TapdReviewScope> = {
	"仅审核未提交修改（暂存、未暂存和未跟踪）": "uncommitted",
	"审核当前分支全部修改（包含已提交修改）": "branch",
};

function parseReviewCommandArgs(args: string[]): {
	baseRef: string;
	instructions?: string;
} {
	let baseRef = DEFAULT_GIT_WORKFLOW_POLICY.baseRef;
	const instructions: string[] = [];
	for (let index = 0; index < args.length; index++) {
		if (args[index] !== "--base") {
			instructions.push(args[index]);
			continue;
		}
		const value = args[index + 1];
		if (!value || value.startsWith("--"))
			throw new Error("--base 需要指定基础分支，例如 --base origin/dev");
		baseRef = value;
		index++;
	}
	const extra = instructions.join(" ").trim();
	return { baseRef, instructions: extra || undefined };
}

export async function requestTapdReview(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	args: string[],
): Promise<void> {
	if (!ctx.isIdle()) {
		ctx.ui.notify("Agent 正在执行，请稍后再运行 /tapd review", "warning");
		return;
	}
	let params: { baseRef: string; instructions?: string };
	try {
		params = parseReviewCommandArgs(args);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(message, "error");
		return;
	}
	let scope: TapdReviewScope = "branch";
	if (ctx.hasUI) {
		const choice = await ctx.ui.select(
			"请选择 TAPD 代码审核范围",
			Object.keys(REVIEW_SCOPE_OPTIONS),
		);
		if (!choice) return;
		scope = REVIEW_SCOPE_OPTIONS[choice as keyof typeof REVIEW_SCOPE_OPTIONS];
	}
	let target: Awaited<ReturnType<typeof resolveTapdReviewTarget>>;
	try {
		target = await resolveTapdReviewTarget(ctx);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(message, "error");
		return;
	}
	pi.sendMessage(
		{
			customType: "tapd-review-tool-request",
			content: buildReviewDelegationMessage({
				target,
				scope,
				baseRef: params.baseRef,
				instructions: params.instructions,
			}),
			display: false,
		},
		{ triggerTurn: true },
	);
}
