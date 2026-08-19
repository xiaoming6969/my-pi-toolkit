import { Type } from "@earendil-works/pi-ai";
import type {
	AgentToolResult,
	AgentToolUpdateCallback,
	ExtensionAPI,
	ExtensionContext,
	Theme,
	ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { toolCall, toolResult } from "../shared/tui/tool-render.js";
import type { DebugSessionCollector } from "./debug-session.js";
import type { ModeController } from "./mode-controller.js";
import { getChatMode } from "./state.js";

export const FINISH_DEBUG_TOOL = "finish_debug_cleanup";
const EmptyParams = Type.Object({});

interface FinishDebugDetails {
	outcome: "completed" | "not_in_debug" | "unavailable";
	logPath?: string;
}

export function registerFinishDebugTool(
	pi: ExtensionAPI,
	options: {
		getCollector: () => DebugSessionCollector | undefined;
		modeController: ModeController;
	},
): void {
	pi.registerTool<typeof EmptyParams>({
		name: FINISH_DEBUG_TOOL,
		label: "Finish Debug Cleanup",
		description:
			"Clear this session's runtime debug log and return to Build mode after all temporary instrumentation has been removed and the fix verified.",
		promptSnippet: "Finish Debug mode after removing temporary instrumentation",
		promptGuidelines: [
			"Call finish_debug_cleanup only in Debug mode, after removing every temporary debug statement/helper and running the smallest relevant verification.",
		],
		parameters: EmptyParams,
		executionMode: "sequential",
		async execute(
			_id: string,
			_params: Record<string, never>,
			_signal: AbortSignal | undefined,
			_update: AgentToolUpdateCallback<unknown> | undefined,
			ctx: ExtensionContext,
		) {
			if (getChatMode() !== "debug") {
				return {
					content: [{ type: "text", text: "Not in Debug mode." }],
					details: { outcome: "not_in_debug" } as FinishDebugDetails,
				};
			}
			const collector = options.getCollector();
			if (!collector) {
				return {
					content: [{ type: "text", text: "The Debug session is unavailable." }],
					details: { outcome: "unavailable" } as FinishDebugDetails,
				};
			}
			await collector.clearAll();
			await collector.stop();
			await collector.forgetEndpoint();
			options.modeController.switchMode("build", ctx);
			return {
				content: [
					{
						type: "text",
						text: `Debug cleanup completed. Cleared ${collector.logPath} and returned to Build mode.`,
					},
				],
				details: {
					outcome: "completed",
					logPath: collector.logPath,
				} as FinishDebugDetails,
			};
		},
		renderCall(_args: Record<string, never>, theme: Theme) {
			return toolCall(theme, "Finish Debug Cleanup", "verifying cleanup");
		},
		renderResult(
			result: AgentToolResult<FinishDebugDetails>,
			{ expanded }: ToolRenderResultOptions,
			theme: Theme,
		) {
			const details = result.details as FinishDebugDetails | undefined;
			const success = details?.outcome === "completed";
			const body = result.content[0];
			return toolResult(theme, {
				status: success ? "success" : "error",
				title: "Finish Debug Cleanup",
				summary: success ? "cleaned · Build mode" : "not completed",
				details:
					expanded && details?.logPath ? [`Log: ${details.logPath}`] : undefined,
				body: expanded && body?.type === "text" ? body.text : undefined,
			});
		},
	});
}
