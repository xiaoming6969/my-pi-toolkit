import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	enterPlanFromTool,
	enterPlanFromUser,
	leavePlan,
} from "./plan-lifecycle.js";
import { refreshChatModeEditor } from "./editor.js";
import { restrictedModeToolNames } from "./policy.js";
import {
	getChatMode,
	nextChatMode,
	setChatMode,
	type ChatMode,
} from "./state.js";

export interface ModeSwitchOptions {
	viaToolApproval?: boolean;
	entrySource?: "tool" | "user";
}

export interface ModeController {
	getToolsBeforeRestricted(): string[] | undefined;
	reset(): void;
	restoreRestricted(mode: ChatMode, savedTools: string[]): void;
	restoreFull(mode: "build" | "debug", savedTools: string[]): void;
	switchMode(
		mode: ChatMode,
		ctx: ExtensionContext,
		options?: ModeSwitchOptions,
	): void;
	updateStatus(ctx: ExtensionContext): void;
}

export function createModeController(
	pi: ExtensionAPI,
	activePlanPath: () => string | undefined,
	persist: () => void,
	onModeChanged?: (
		mode: ChatMode,
		previous: ChatMode,
		ctx: ExtensionContext,
	) => void,
): ModeController {
	let toolsBeforeRestricted: string[] | undefined;

	function updateStatus(ctx: ExtensionContext): void {
		// Mode is shown on the editor top border; clear legacy footer badge.
		ctx.ui.setStatus("chat-mode", undefined);
		refreshChatModeEditor();
	}

	function availableTools(names: string[]): string[] {
		const available = new Set(
			pi.getAllTools().map((tool: { name: string }) => tool.name),
		);
		return names.filter((name) => available.has(name));
	}

	function restoreBuildTools(): void {
		if (!toolsBeforeRestricted) return;
		pi.setActiveTools(availableTools(toolsBeforeRestricted));
	}

	function applyModeTools(mode: ChatMode): void {
		if (mode === "build" || mode === "debug") {
			restoreBuildTools();
			toolsBeforeRestricted = undefined;
			return;
		}
		const baseTools = toolsBeforeRestricted ?? pi.getActiveTools();
		toolsBeforeRestricted = baseTools;
		pi.setActiveTools(restrictedModeToolNames(baseTools, mode));
	}

	function notifyMode(mode: ChatMode, ctx: ExtensionContext): void {
		let message = "Mode: BUILD — 已恢复完整工具权限。";
		if (mode === "ask") {
			message = "Mode: ASK — Bash 仅限白名单查询，项目写入仅限 .pi/。";
		}
		if (mode === "debug") {
			message = "Mode: DEBUG — 完整工具已启用，正在准备运行时日志面板。";
		}
		if (mode === "plan") {
			message = `Mode: PLAN — 仅可写入 ${activePlanPath() ?? "活动 Plan"}。`;
		}
		ctx.ui.notify(message, "info");
	}

	return {
		getToolsBeforeRestricted: () => toolsBeforeRestricted,
		reset() {
			restoreBuildTools();
			toolsBeforeRestricted = undefined;
			setChatMode("build");
		},
		restoreRestricted(mode, savedTools) {
			toolsBeforeRestricted = savedTools;
			setChatMode(mode);
			if (mode !== "ask" && mode !== "plan") return;
			pi.setActiveTools(restrictedModeToolNames(savedTools, mode));
		},
		restoreFull(mode, savedTools) {
			toolsBeforeRestricted = undefined;
			setChatMode(mode);
			pi.setActiveTools(availableTools(savedTools));
		},
		switchMode(mode, ctx, options) {
			const previous = getChatMode();
			if (mode === previous) return;
			if (mode === "plan") {
				if (options?.entrySource === "tool") enterPlanFromTool();
				else enterPlanFromUser();
			} else if (previous === "plan") {
				leavePlan(options?.viaToolApproval === true);
			}
			applyModeTools(mode);
			setChatMode(mode);
			updateStatus(ctx);
			persist();
			notifyMode(mode, ctx);
			onModeChanged?.(mode, previous, ctx);
		},
		updateStatus,
	};
}

export function toggleMode(
	controller: ModeController,
	ctx: ExtensionContext,
	enterPlan: () => Promise<unknown>,
): void {
	if (!ctx.isIdle()) {
		ctx.ui.notify("请等待当前 Agent 运行结束后再切换模式。", "warning");
		return;
	}
	const next = nextChatMode();
	if (next === "plan") {
		void enterPlan();
		return;
	}
	controller.switchMode(next, ctx);
}
