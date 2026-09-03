import type {
	ExtensionContext,
	ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { checkAskToolCall, checkPlanToolCall } from "./policy.js";
import { getChatMode } from "./state.js";

/** `tool_call` guard: enforce the Ask / Plan tool policies for the active mode. */
export function createToolCallHandler(
	activePlanPath: () => string | undefined,
): (
	event: ToolCallEvent,
	ctx: ExtensionContext,
) => Promise<{ block: true; reason: string } | undefined> {
	return async (event, ctx) => {
		const mode = getChatMode();
		let reason: string | undefined;
		if (mode === "ask")
			reason = await checkAskToolCall(event, ctx.cwd, ctx.isProjectTrusted());
		if (mode === "plan") {
			reason = await checkPlanToolCall(
				event,
				ctx.cwd,
				activePlanPath(),
				ctx.isProjectTrusted(),
			);
		}
		return reason ? { block: true, reason } : undefined;
	};
}
