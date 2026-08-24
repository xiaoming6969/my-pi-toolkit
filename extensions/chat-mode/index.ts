import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { BrowserReviewManager } from "../browser-review/server.js";
import { registerAskUserChoiceTool } from "../shared/ask-user-choice-tool.js";
import { registerDebugCommand, type DebugPanelActions } from "./debug-command.js";
import { createDebugPanelController } from "./debug-dialog.js";
import {
	createDebugSessionCollector,
	type DebugSessionCollector,
} from "./debug-session.js";
import { registerFinishDebugTool } from "./debug-tool.js";
import { createModeController } from "./mode-controller.js";
import { getPlanLifecycleSnapshot } from "./plan-lifecycle.js";
import { registerPlanCommand } from "./plan-command.js";
import {
	CHAT_MODE_STATE_ENTRY,
	registerChatModeLifecycle,
} from "./lifecycle.js";
import { seedPlanFile, type SessionPlanFile } from "./plan-file.js";
import { registerPlanTools } from "./plan-tools.js";
import { registerSessionPlanCleanup } from "./session-plan-cleanup.js";
import { getChatMode, isRestrictedMode } from "./state.js";

export default function chatModeExtension(pi: ExtensionAPI): void {
	registerAskUserChoiceTool(pi);
	registerSessionPlanCleanup(pi);
	let planFile: SessionPlanFile | undefined;
	let debugCollector: DebugSessionCollector | undefined;
	const planReviews = new BrowserReviewManager();
	let debugPanel: DebugPanelActions;
	let pendingImplementationKickoff = false;

	function persistMode(): void {
		if (!planFile) return;
		pi.appendEntry(CHAT_MODE_STATE_ENTRY, {
			version: 3,
			mode: getChatMode(),
			toolsBeforeRestricted: modeController.getToolsBeforeRestricted(),
			planLifecycle: getPlanLifecycleSnapshot(),
		});
	}

	const modeController = createModeController(
		pi,
		() => planFile?.absolutePath,
		persistMode,
		(mode, previous) => {
			if (!isRestrictedMode(mode) && isRestrictedMode(previous)) {
				pendingImplementationKickoff = true;
			}
		},
	);
	debugPanel = createDebugPanelController(pi, () => debugCollector);

	async function enterPlan(ctx: ExtensionContext, source: "tool" | "user") {
		if (!planFile) throw new Error("Session Plan path is not initialized");
		const seed = await seedPlanFile(planFile);
		modeController.switchMode("plan", ctx, { entrySource: source });
		persistMode();
		return { plan: planFile, seed };
	}

	registerPlanTools(pi, {
		getMode: getChatMode,
		getPlan: () => planFile,
		enterPlan,
		switchMode: modeController.switchMode,
		markImplementationKickoff: () => {
			pendingImplementationKickoff = true;
		},
	}, planReviews);

	registerPlanCommand(pi, {
		getMode: getChatMode,
		getPlan: () => planFile,
		enterPlan: (ctx) => enterPlan(ctx, "user"),
	}, planReviews);
	registerDebugCommand(pi, modeController, debugPanel);
	registerFinishDebugTool(pi, {
		getCollector: () => debugCollector,
		modeController,
	});

	pi.on("session_shutdown", () => planReviews.dispose());

	registerChatModeLifecycle(pi, {
		modeController,
		getActiveTools: () => pi.getActiveTools(),
		getPlan: () => planFile,
		setPlan: async (plan) => {
			await debugCollector?.dispose();
			planFile = plan;
			debugCollector = createDebugSessionCollector(plan.absolutePath);
		},
		getDebugCollector: () => debugCollector,
		openDebugPanel: (ctx) => debugPanel.open(ctx),
		enterPlan,
		persistMode,
		clearImplementationKickoff: () => {
			pendingImplementationKickoff = false;
		},
		hasImplementationKickoff: () => pendingImplementationKickoff,
		consumeImplementationKickoff: () => {
			pendingImplementationKickoff = false;
		},
	});
}
