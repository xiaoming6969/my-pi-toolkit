import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	SessionShutdownEvent,
} from "@earendil-works/pi-coding-agent";
import {
	cancelBackgroundSubagentsForSession,
	subscribeBackgroundSubagents,
} from "../../shared/subagent/background.js";
import {
	abortAllLiveSubagents,
	subscribeSubagentRegistry,
} from "../../shared/subagent/registry.js";
import { currentSubagentFooterStatus } from "./footer-status.js";
import { withWorking } from "../../shared/tui/working-cancel.js";

export default function subagentConsole(pi: ExtensionAPI): void {
	let unsubscribeStatus: (() => void) | undefined;
	pi.on("session_start", (_event: unknown, ctx: ExtensionContext) => {
		unsubscribeStatus?.();
		const refreshStatus = () =>
			ctx.ui.setStatus("subagent", currentSubagentFooterStatus());
		const unsubscribeRegistry = subscribeSubagentRegistry(refreshStatus);
		const unsubscribeBackground = subscribeBackgroundSubagents(refreshStatus);
		unsubscribeStatus = () => {
			unsubscribeRegistry();
			unsubscribeBackground();
		};
		refreshStatus();
	});
	pi.on(
		"session_shutdown",
		(_event: SessionShutdownEvent, ctx: ExtensionContext) => {
			unsubscribeStatus?.();
			unsubscribeStatus = undefined;
			ctx.ui.setStatus("subagent", undefined);
			cancelBackgroundSubagentsForSession(ctx.sessionManager.getSessionId());
			abortAllLiveSubagents();
		},
	);
	pi.registerCommand("subagents", {
		description: "查看、取消或清理交互式子 Agent",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			await withWorking(
				ctx,
				"subagents",
				async (working) => {
					working?.setMessage("Working... 正在加载子 Agent");
					const { showSubagents } = await import("./panel.js");
					await showSubagents(ctx, working);
				},
				{ message: "Working... 正在加载子 Agent", notifyAbort: true },
			);
		},
	});
	pi.registerShortcut("alt+a", {
		description: "进入最近的交互式子 Agent",
		handler: async (ctx: ExtensionContext) => {
			await withWorking(
				ctx,
				"subagents",
				async (working) => {
					working?.setMessage("Working... 正在加载子 Agent");
					const { enterLatestSubagent } = await import("./panel.js");
					await enterLatestSubagent(ctx, working);
				},
				{ message: "Working... 正在加载子 Agent", notifyAbort: true },
			);
		},
	});
}
