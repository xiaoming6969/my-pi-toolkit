import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { LiveSubagentRun } from "../../shared/subagent/registry.js";

export type SteerOutcome = "steered" | "queued" | "rejected";

/**
 * Deliver a user-typed message to a live child. A running turn receives it
 * immediately through Pi's RPC steer; an idle reusable child gets it as a new
 * queued turn. One-shot or foreign children are rejected.
 */
export function deliverSubagentMessage(
	run: LiveSubagentRun,
	message: string,
	currentSessionId: string,
): SteerOutcome {
	const text = message.trim();
	if (!text || run.parentSessionId !== currentSessionId) return "rejected";
	const active = run.status === "starting" || run.status === "running";
	if (active && run.steer) {
		try {
			run.steer(text);
			return "steered";
		} catch {
			// The turn may have finished between the status check and the send.
		}
	}
	if (!run.reusable) return "rejected";
	void run.request(text).catch(() => {});
	return "queued";
}

export async function promptSubagentMessage(
	ctx: ExtensionContext,
	run: LiveSubagentRun,
): Promise<void> {
	const text = await ctx.ui.input(
		`发送消息给 ${run.title}`,
		"运行中：立即插入当前 turn；空闲：排队为新一轮任务",
	);
	if (!text?.trim()) return;
	const outcome = deliverSubagentMessage(
		run,
		text,
		ctx.sessionManager.getSessionId(),
	);
	if (outcome === "steered") ctx.ui.notify(`已向 ${run.title} 插入 steer 消息`, "info");
	else if (outcome === "queued") ctx.ui.notify(`已为 ${run.title} 排队新一轮任务`, "info");
	else ctx.ui.notify("该子 Agent 不接受消息：已结束且不可复用，或属于其他会话", "warning");
}
