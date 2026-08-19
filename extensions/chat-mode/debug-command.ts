import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ModeController } from "./mode-controller.js";
import { getChatMode } from "./state.js";

export interface DebugPanelActions {
	open(ctx: ExtensionContext): Promise<void>;
}

export function registerDebugCommand(
	pi: ExtensionAPI,
	modeController: ModeController,
	panel: DebugPanelActions,
): void {
	pi.registerCommand("debuglog", {
		description: "进入 Debug Mode；已进入时重新打开实时日志面板",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (args.trim()) {
				ctx.ui.notify("用法：/debuglog", "warning");
				return;
			}
			if (!ctx.isIdle()) {
				ctx.ui.notify(
					"请等待当前 Agent 运行结束后再打开 Debug 日志面板。",
					"warning",
				);
				return;
			}
			if (getChatMode() !== "debug") {
				modeController.switchMode("debug", ctx);
				return;
			}
			await panel.open(ctx);
		},
	});
}
