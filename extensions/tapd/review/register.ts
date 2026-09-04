import type {
	AgentToolResult,
	ExtensionAPI,
	ExtensionContext,
	Theme,
	ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolCall, toolResult } from "../../shared/tui/tool-render.js";
import { DEFAULT_GIT_WORKFLOW_POLICY } from "../git/policy.js";
import type { TapdReviewScope, TapdReviewToolDetails } from "./types.js";

interface ReviewToolParams {
	scope?: TapdReviewScope;
	baseRef?: string;
	instructions?: string;
}

type ReviewRuntime = typeof import("./tool.js");

export function registerTapdReviewTool(pi: ExtensionAPI): void {
	let runtime: ReviewRuntime | undefined;
	const loadRuntime = async (): Promise<ReviewRuntime> => {
		runtime ??= await import("./tool.js");
		return runtime;
	};

	pi.registerTool({
		name: "tapd_review",
		label: "TAPD Code Review",
		description:
			"Use an isolated read-only reviewer subagent to compare the current TAPD story implementation with understanding.md and design.md, including a dedicated over-engineering pass. Can review only uncommitted changes or all branch and working-tree changes, and returns a severity-ranked report.",
		promptSnippet:
			"Review the current TAPD story implementation against its requirement and design, including over-engineering",
		promptGuidelines: [
			"Use tapd_review when the user runs /tapd review or explicitly asks for the TAPD requirement implementation to be reviewed.",
			"After tapd_review returns, summarize the highest-severity findings and wait for confirmation before modifying code.",
		],
		parameters: Type.Object({
			scope: Type.Optional(
				Type.Unsafe<TapdReviewScope>({
					type: "string",
					enum: ["uncommitted", "branch"],
					description:
						"Review uncommitted changes only, or all changes since the base branch. Defaults to branch.",
				}),
			),
			baseRef: Type.Optional(
				Type.String({
					description: "Git base ref. Defaults to origin/dev.",
				}),
			),
			instructions: Type.Optional(
				Type.String({ description: "Additional review focus from the user" }),
			),
		}),

		async execute(
			toolCallId: string,
			params: ReviewToolParams,
			signal: AbortSignal | undefined,
			onUpdate:
				| ((partial: {
						content: Array<{ type: "text"; text: string }>;
						details: TapdReviewToolDetails;
				  }) => void)
				| undefined,
			ctx: ExtensionContext,
		) {
			const { executeTapdReview } = await loadRuntime();
			return executeTapdReview(toolCallId, params, signal, onUpdate, ctx);
		},

		renderCall(args: ReviewToolParams, theme: Theme) {
			if (runtime) return runtime.renderTapdReviewCall(args, theme);
			const range =
				args.scope === "uncommitted"
					? "未提交修改"
					: args.baseRef || DEFAULT_GIT_WORKFLOW_POLICY.baseRef;
			return toolCall(theme, "tapd_review", range);
		},

		renderResult(
			result: AgentToolResult<TapdReviewToolDetails>,
			options: ToolRenderResultOptions,
			theme: Theme,
			context: { isError: boolean },
		) {
			if (runtime) {
				return runtime.renderTapdReviewResult(result, options, theme, context);
			}
			return toolResult(theme, {
				status: context.isError ? "error" : "active",
				title: "TAPD review",
				summary: context.isError ? "Review failed" : "reviewing",
			});
		},
	});
}
