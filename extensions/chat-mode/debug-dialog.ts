import type {
	ExtensionAPI,
	ExtensionContext,
	Theme,
} from "@earendil-works/pi-coding-agent";
import {
	matchesKey,
	truncateToWidth,
	wrapTextWithAnsi,
	type Component,
	type KeybindingsManager,
	type TUI,
} from "@earendil-works/pi-tui";
import {
	acquireMouseTracking,
	mouseWheelDirection,
	overlayWheelSupported,
} from "../shared/tui/mouse.js";
import {
	overlayInnerWidth,
	overlayViewportHeight,
	renderOverlayShell,
	STANDARD_OVERLAY_OPTIONS,
} from "../shared/tui/overlay-shell.js";
import { UI_GLYPHS } from "../shared/tui/visual-language.js";
import type { DebugPanelActions } from "./debug-command.js";
import { formatDebugLogLines } from "./debug-log-format.js";
import type { DebugSessionCollector } from "./debug-session.js";
import {
	DEBUG_RESOLVED_MESSAGE,
	debugReproducedMessage,
} from "./prompt.js";
import { getChatMode } from "./state.js";

export type DebugDialogAction = "closed" | "reproduced" | "resolved";
const ACTIONS = ["已复现", "已解决", "清除日志"] as const;
const WHEEL_STEP = 3;

interface DebugDialogOptions {
	tui: TUI;
	theme: Theme;
	collector: DebugSessionCollector;
	isIdle: () => boolean;
	close: (action: DebugDialogAction) => void;
}

class DebugLogDialog implements Component {
	private readonly releaseMouse: () => void;
	private readonly unsubscribe: () => void;
	private lines: string[] = [];
	private selected = 0;
	private scrollOffset = 0;
	private followTail = true;
	private notice = "";
	private disposed = false;

	constructor(private readonly options: DebugDialogOptions) {
		this.releaseMouse = acquireMouseTracking(options.tui);
		this.unsubscribe = options.collector.subscribe(() => void this.refresh());
		void this.refresh();
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.options.close("closed");
			return;
		}
		if (matchesKey(data, "tab") || matchesKey(data, "right")) {
			this.select(1);
			return;
		}
		if (matchesKey(data, "shift+tab") || matchesKey(data, "left")) {
			this.select(-1);
			return;
		}
		if (matchesKey(data, "enter")) {
			void this.activate();
			return;
		}
		const wheel = mouseWheelDirection(data);
		let target: number | undefined;
		if (wheel !== undefined) target = this.scrollOffset + wheel * WHEEL_STEP;
		else if (matchesKey(data, "up")) target = this.scrollOffset - 1;
		else if (matchesKey(data, "down")) target = this.scrollOffset + 1;
		else if (matchesKey(data, "pageUp")) {
			target = this.scrollOffset - this.currentViewportHeight();
		} else if (matchesKey(data, "pageDown")) {
			target = this.scrollOffset + this.currentViewportHeight();
		} else if (matchesKey(data, "home")) target = 0;
		else if (matchesKey(data, "end")) {
			this.followTail = true;
			this.options.tui.requestRender();
			return;
		}
		if (target !== undefined) this.scrollTo(target);
	}

	private select(delta: number): void {
		this.selected = (this.selected + delta + ACTIONS.length) % ACTIONS.length;
		this.notice = "";
		this.options.tui.requestRender();
	}

	private async activate(): Promise<void> {
		if (this.selected !== 2 && !this.options.isIdle()) {
			this.notice = "请等待当前 Agent 运行结束";
			this.options.tui.requestRender();
			return;
		}
		if (this.selected === 2) {
			await this.options.collector.clear();
			this.scrollOffset = 0;
			this.followTail = true;
			this.notice = "运行日志已清除，复现步骤已保留";
			await this.refresh();
			return;
		}
		if (this.selected === 0 && this.lines.length === 0) {
			this.notice = "尚无日志，请先复现问题";
			this.options.tui.requestRender();
			return;
		}
		this.options.close(this.selected === 0 ? "reproduced" : "resolved");
	}

	private currentViewportHeight(): number {
		return Math.max(
			1,
			overlayViewportHeight(this.options.tui.terminal.rows) - 1,
		);
	}

	private scrollTo(offset: number): void {
		this.scrollOffset = Math.max(0, offset);
		this.followTail = false;
		this.options.tui.requestRender();
	}

	private async refresh(): Promise<void> {
		const rawLines = await this.options.collector.readLines();
		const lines = rawLines.flatMap(formatDebugLogLines);
		if (this.disposed) return;
		this.lines = lines;
		this.options.tui.requestRender();
	}

	render(width: number): string[] {
		const innerWidth = overlayInnerWidth(width);
		const viewportHeight = this.currentViewportHeight();
		const renderedLines = this.lines.flatMap((line) =>
			wrapTextWithAnsi(this.options.theme.fg("muted", line), innerWidth),
		);
		const maximumOffset = Math.max(0, renderedLines.length - viewportHeight);
		const offset = this.followTail
			? maximumOffset
			: Math.min(this.scrollOffset, maximumOffset);
		const visible = renderedLines.slice(offset, offset + viewportHeight);
		if (visible.length === 0) {
			visible.push(this.options.theme.fg("dim", "等待运行时日志…"));
		}
		while (visible.length < viewportHeight) visible.push("");

		const buttons = ACTIONS.map((label, index) => {
			const text = `[ ${label} ]`;
			return index === this.selected
				? this.options.theme.fg(
						"accent",
						this.options.theme.bold(`${UI_GLYPHS.action} ${text}`),
					)
				: this.options.theme.fg("dim", `  ${text}`);
		}).join("  ");
		const actionLine = truncateToWidth(buttons, innerWidth, "");
		const end = Math.min(renderedLines.length, offset + viewportHeight);
		const scroll = renderedLines.length
			? `${offset + 1}-${end}/${renderedLines.length}`
			: "0/0";
		const wheel = overlayWheelSupported(this.options.tui) ? "/wheel" : "";
		const footer = this.notice || `↑↓${wheel}/PgUp/PgDn scroll · Tab/←→ select · Enter run · Esc close · ${scroll}`;
		return renderOverlayShell(this.options.theme, width, {
			header: `${this.options.theme.bold("DEBUG LOGS")}  ${this.options.theme.fg("muted", this.options.collector.logPath)}`,
			body: [...visible, actionLine],
			footer: this.options.theme.fg(
				maximumOffset > 0 ? "muted" : "dim",
				footer,
			),
		});
	}

	invalidate(): void {}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.unsubscribe();
		this.releaseMouse();
	}
}

async function showDebugDialog(
	ctx: ExtensionContext,
	collector: DebugSessionCollector,
): Promise<DebugDialogAction> {
	if (ctx.mode !== "tui") return "closed";
	await collector.ensure();
	return ctx.ui.custom<DebugDialogAction>(
		(
			tui: TUI,
			theme: Theme,
			_keybindings: KeybindingsManager,
			done: (action: DebugDialogAction) => void,
		) =>
			new DebugLogDialog({
				tui,
				theme,
				collector,
				isIdle: () => ctx.isIdle(),
				close: done,
			}),
		{
			...STANDARD_OVERLAY_OPTIONS,
			overlayOptions: {
				...STANDARD_OVERLAY_OPTIONS.overlayOptions,
				minWidth: 44,
			},
		},
	);
}

export function createDebugPanelController(
	pi: ExtensionAPI,
	getCollector: () => DebugSessionCollector | undefined,
): DebugPanelActions {
	let opening: Promise<void> | undefined;
	return {
		open(ctx) {
			if (ctx.mode !== "tui" || getChatMode() !== "debug") {
				return Promise.resolve();
			}
			if (opening) return opening;
			const collector = getCollector();
			if (!collector) return Promise.resolve();
			opening = showDebugDialog(ctx, collector)
				.then((action) => {
					if (action !== "closed" && getChatMode() !== "debug") {
						ctx.ui.notify("Debug 模式已结束，已忽略该操作。", "warning");
						return;
					}
					if (action === "reproduced") {
						pi.sendUserMessage(debugReproducedMessage(collector.logPath));
					}
					if (action === "resolved") pi.sendUserMessage(DEBUG_RESOLVED_MESSAGE);
				})
				.catch((error: unknown) => {
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`Debug 日志面板打开失败：${message}`, "error");
				})
				.finally(() => {
					opening = undefined;
				});
			return opening;
		},
	};
}
