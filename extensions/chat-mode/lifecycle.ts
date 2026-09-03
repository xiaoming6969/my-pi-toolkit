import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type {
	AgentSettledEvent,
	BeforeAgentStartEvent,
	ContextEvent,
	ExtensionAPI,
	ExtensionContext,
	KeybindingsManager,
	SessionCompactEvent,
	SessionStartEvent,
	ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import type { DebugSessionCollector } from "./debug-session.js";
import { ChatModeEditor, unbindChatModeEditor } from "./editor.js";
import { type ModeController, toggleMode } from "./mode-controller.js";
import {
	enterPlanFromTool,
	resetPlanLifecycle,
	resetPlanRemindersAfterCompaction,
	restorePlanLifecycle,
	takePlanReminder,
	type PlanLifecycleSnapshot,
} from "./plan-lifecycle.js";
import {
	readPlanFile,
	seedPlanFile,
	sessionPlanFile,
	type SessionPlanFile,
} from "./plan-file.js";
import {
	ENSURE_ASK_FOR_DOCS_CONSUMED_ENTRY,
	wantsAskModeForDocs,
} from "./ensure-ask-for-docs.js";
import { checkAskToolCall, checkPlanToolCall } from "./policy.js";
import {
	ASK_MODE_PROMPT,
	BUILD_MODE_PROMPT,
	debugModePrompt,
	IMPLEMENTATION_KICKOFF,
	PLAN_EXIT_REMINDER_CUSTOM_TYPE,
	PLAN_MODE_REMINDER_CUSTOM_TYPE,
	planReminderText,
} from "./prompt.js";
import { getChatMode, isRestrictedMode, type ChatMode } from "./state.js";

export const CHAT_MODE_STATE_ENTRY = "chat-mode-state";
const EPHEMERAL_PLAN_ROOT = resolve(tmpdir(), "pi-plan-sessions");

export interface PersistedModeState {
	version?: 3;
	mode: ChatMode;
	toolsBeforeRestricted?: string[];
	toolsBeforeAsk?: string[];
	planLifecycle?: PlanLifecycleSnapshot;
}

export interface ChatModeLifecycleOptions {
	modeController: ModeController;
	getActiveTools: () => string[];
	getPlan: () => SessionPlanFile | undefined;
	setPlan: (plan: SessionPlanFile) => Promise<void>;
	getDebugCollector: () => DebugSessionCollector | undefined;
	openDebugPanel: (ctx: ExtensionContext) => Promise<void>;
	enterPlan: (
		ctx: ExtensionContext,
		source: "tool" | "user",
	) => Promise<unknown>;
	persistMode: () => void;
	clearImplementationKickoff: () => void;
	hasImplementationKickoff: () => boolean;
	consumeImplementationKickoff: () => void;
}
export function registerChatModeLifecycle(
	pi: ExtensionAPI,
	options: ChatModeLifecycleOptions,
): void {
	pi.on("session_start", createSessionStartHandler(options));
	pi.on("session_compact", createSessionCompactHandler(options));
	pi.on("before_agent_start", createBeforeAgentStartHandler(pi, options));
	pi.on("context", createContextHandler(options));
	pi.on("tool_call", createToolCallHandler(options));
	pi.on("agent_settled", (_event: AgentSettledEvent, ctx: ExtensionContext) => {
		if (getChatMode() === "debug") void options.openDebugPanel(ctx);
	});
	pi.on("session_shutdown", async () => {
		unbindChatModeEditor();
		await options.getDebugCollector()?.stop();
	});
}

function createSessionStartHandler(options: ChatModeLifecycleOptions) {
	return async (_event: SessionStartEvent, ctx: ExtensionContext) => {
		await restoreSessionModeState(options, ctx);
		if (ctx.mode !== "tui") return;
		ctx.ui.setEditorComponent(createChatModeEditor(options, ctx));
		options.modeController.updateStatus(ctx);
	};
}

async function restoreSessionModeState(
	options: ChatModeLifecycleOptions,
	ctx: ExtensionContext,
): Promise<void> {
	options.clearImplementationKickoff();
	options.modeController.reset();
	resetPlanLifecycle();

	const plan = sessionPlanFile(
		ctx.sessionManager.getSessionDir() || EPHEMERAL_PLAN_ROOT,
		ctx.sessionManager.getSessionId(),
	);
	await options.setPlan(plan);

	const branch = ctx.sessionManager.getBranch() as Array<{
		type: string;
		customType?: string;
		data?: PersistedModeState;
	}>;
	const saved = branch
		.filter(
			(entry) =>
				entry.type === "custom" && entry.customType === CHAT_MODE_STATE_ENTRY,
		)
		.pop()?.data;

	restorePlanLifecycle(saved?.planLifecycle);
	if (saved?.mode === "plan" && saved.planLifecycle?.state === undefined) {
		enterPlanFromTool();
	}
	if (saved?.mode === "plan") await seedPlanFile(plan);
	if (saved && isRestrictedMode(saved.mode)) {
		const savedTools =
			saved.toolsBeforeRestricted ??
			saved.toolsBeforeAsk ??
			options.getActiveTools();
		options.modeController.restoreRestricted(saved.mode, savedTools);
	}
	if (saved?.mode === "debug") {
		const savedTools =
			saved.toolsBeforeRestricted ??
			saved.toolsBeforeAsk ??
			options.getActiveTools();
		options.modeController.restoreFull("debug", savedTools);
		try {
			await options.getDebugCollector()?.ensure();
		} catch (error) {
			if (ctx.hasUI) {
				ctx.ui.notify(
					`Debug 日志采集器启动失败：${error instanceof Error ? error.message : String(error)}`,
					"error",
				);
			}
		}
	}
	options.modeController.updateStatus(ctx);
	options.persistMode();
}

function createChatModeEditor(
	options: ChatModeLifecycleOptions,
	ctx: ExtensionContext,
) {
	return (tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
		// EditorFactory / CustomEditor resolve KeybindingsManager via different pi-tui copies.
		const editor = new ChatModeEditor(
			tui,
			theme,
			keybindings as ConstructorParameters<typeof ChatModeEditor>[2],
		);
		editor.resolveTheme = () => ctx.ui.theme;
		editor.onToggle = () =>
			toggleMode(options.modeController, ctx, () =>
				options.enterPlan(ctx, "user"),
			);
		return editor;
	};
}

function createSessionCompactHandler(options: ChatModeLifecycleOptions) {
	return (_event: SessionCompactEvent) => {
		resetPlanRemindersAfterCompaction();
		options.persistMode();
	};
}

function createBeforeAgentStartHandler(pi: ExtensionAPI, options: ChatModeLifecycleOptions) {
	return async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
		// TAPD 文档流：Plan 只能写 session plan.md，与 .pi/docs 冲突，单次切到 Ask。
		if (wantsAskModeForDocs(ctx.sessionManager.getEntries())) {
			pi.appendEntry(ENSURE_ASK_FOR_DOCS_CONSUMED_ENTRY, { version: 1 });
			if (getChatMode() !== "ask") {
				options.modeController.switchMode("ask", ctx);
			}
		}

		const mode = getChatMode();
		const kind = takePlanReminder(mode === "plan");
		const plan = options.getPlan();
		const hasContent =
			plan && (kind === "full" || kind === "reentry")
				? (await readPlanFile(plan)) !== undefined
				: false;
		const reminder = kind
			? planReminderText(kind, plan?.absolutePath ?? "unavailable", hasContent)
			: undefined;
		if (kind) options.persistMode();

		let message:
			| { customType: string; content: string; display: false }
			| undefined;
		if (kind && reminder) {
			const customType =
				kind === "exit"
					? PLAN_EXIT_REMINDER_CUSTOM_TYPE
					: PLAN_MODE_REMINDER_CUSTOM_TYPE;
			message = { customType, content: reminder, display: false };
		}

		if (mode === "build") {
			return {
				systemPrompt: `${event.systemPrompt}\n\n${BUILD_MODE_PROMPT}`,
				...(message ? { message } : {}),
			};
		}
		if (mode === "ask") {
			return {
				systemPrompt: `${event.systemPrompt}\n\n${ASK_MODE_PROMPT}`,
				...(message ? { message } : {}),
			};
		}
		if (mode === "debug") {
			const collector = options.getDebugCollector();
			if (collector) {
				let endpoint = "unavailable — append JSONL directly to the session log";
				try {
					endpoint = (await collector.ensure()).endpoint;
				} catch (error) {
					if (ctx.hasUI) {
						ctx.ui.notify(
							`Debug 日志采集器启动失败：${error instanceof Error ? error.message : String(error)}`,
							"error",
						);
					}
				}
				return {
					systemPrompt: `${event.systemPrompt}\n\n${debugModePrompt(endpoint, collector.logPath)}`,
					...(message ? { message } : {}),
				};
			}
		}
		if (message) return { message };
	};
}

function createContextHandler(options: ChatModeLifecycleOptions) {
	return (event: ContextEvent) => {
		const mode = getChatMode();
		const messages = event.messages.filter(
			(message: ContextEvent["messages"][number]) =>
				mode === "plan" ||
				!(
					message.role === "custom" &&
					message.customType === PLAN_MODE_REMINDER_CUSTOM_TYPE
				),
		);
		if (!options.hasImplementationKickoff() || mode !== "build") {
			return { messages };
		}

		options.consumeImplementationKickoff();
		return {
			messages: [
				...messages,
				{
					role: "user" as const,
					content: [{ type: "text" as const, text: IMPLEMENTATION_KICKOFF }],
					timestamp: Date.now(),
				},
			],
		};
	};
}

function createToolCallHandler(options: ChatModeLifecycleOptions) {
	return async (event: ToolCallEvent, ctx: ExtensionContext) => {
		const mode = getChatMode();
		let reason: string | undefined;
		if (mode === "ask")
			reason = await checkAskToolCall(event, ctx.cwd, ctx.isProjectTrusted());
		if (mode === "plan") {
			reason = await checkPlanToolCall(
				event,
				ctx.cwd,
				options.getPlan()?.absolutePath,
				ctx.isProjectTrusted(),
			);
		}
		return reason ? { block: true, reason } : undefined;
	};
}
