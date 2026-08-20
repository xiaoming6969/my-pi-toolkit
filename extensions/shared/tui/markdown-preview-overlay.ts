import {
	getMarkdownTheme,
	type ExtensionContext,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	Box,
	type Component,
	type KeybindingsManager,
	Markdown,
	matchesKey,
	type TUI,
} from "@earendil-works/pi-tui";
import {
	acquireMouseTracking,
	mouseWheelDirection,
	overlayWheelSupported,
} from "./mouse.js";
import {
	createSharedMarkdownRendering,
	type SharedMarkdownRendering,
} from "./markdown.js";
import {
	overlayInnerWidth,
	overlayViewportHeight,
	renderOverlayShell,
} from "./overlay-shell.js";

const PANEL_HEIGHT_RATIO = 0.84;
const PANEL_MARGIN = 1;
const WHEEL_STEP = 3;

export interface MarkdownPreviewOptions {
	title: string;
	path: string;
	content: string | undefined;
	emptyMessage?: string;
}

interface DialogOptions extends MarkdownPreviewOptions {
	tui: TUI;
	theme: Theme;
	markdown: SharedMarkdownRendering;
	close: () => void;
}

function scrollTarget(
	data: string,
	current: number,
	viewport: number,
	maximum: number,
): number | undefined {
	const wheel = mouseWheelDirection(data);
	if (wheel !== undefined) return current + wheel * WHEEL_STEP;
	if (matchesKey(data, "up")) return current - 1;
	if (matchesKey(data, "down")) return current + 1;
	if (matchesKey(data, "pageUp")) return current - viewport;
	if (matchesKey(data, "pageDown")) return current + viewport;
	if (matchesKey(data, "home")) return 0;
	if (matchesKey(data, "end")) return maximum;
	return undefined;
}

interface ScrollState {
	offset: number;
	viewportHeight: number;
	contentHeight: number;
}

function maximumOffset(state: ScrollState): number {
	return Math.max(0, state.contentHeight - state.viewportHeight);
}

function renderPreview(
	options: DialogOptions,
	contentBox: Box,
	state: ScrollState,
	width: number,
): string[] {
	const innerWidth = overlayInnerWidth(width);
	const background = (text: string) =>
		options.theme.bg("customMessageBg", text);
	const content = contentBox.render(innerWidth);
	state.contentHeight = content.length;
	state.viewportHeight = overlayViewportHeight(options.tui.terminal.rows, {
		maxHeightRatio: PANEL_HEIGHT_RATIO,
		margin: PANEL_MARGIN,
	});
	state.offset = Math.min(state.offset, maximumOffset(state));
	const visible = content.slice(state.offset, state.offset + state.viewportHeight);
	const blank = background(" ".repeat(innerWidth));
	while (visible.length < state.viewportHeight) visible.push(blank);

	const end = Math.min(state.contentHeight, state.offset + state.viewportHeight);
	const scrollHelp = overlayWheelSupported(options.tui)
		? "↑↓/wheel/PgUp/PgDn scroll"
		: "↑↓/PgUp/PgDn scroll";
	return renderOverlayShell(options.theme, width, {
		header: background(
			`${options.theme.bold(options.theme.fg("text", options.title))}  ${options.theme.fg("muted", options.path)}`,
		),
		body: visible,
		footer: background(
			options.theme.fg(
				"dim",
				`${scrollHelp} · Enter/Esc close · ${state.offset + 1}-${end}/${state.contentHeight}`,
			),
		),
	});
}

function createMarkdownPreviewDialog(options: DialogOptions): Component {
	const contentBox = new Box(1, 0, (text: string) =>
		options.theme.bg("customMessageBg", text),
	);
	contentBox.addChild(
		new Markdown(
			options.content ?? options.emptyMessage ?? "_暂无内容。_",
			0,
			0,
			getMarkdownTheme(),
			undefined,
			options.markdown.options("assistant"),
		),
	);
	const releaseMouse = acquireMouseTracking(options.tui);
	const scroll: ScrollState = {
		offset: 0,
		viewportHeight: 1,
		contentHeight: 0,
	};
	return {
		handleInput(data: string): void {
			if (matchesKey(data, "enter") || matchesKey(data, "escape")) {
				options.close();
				return;
			}
			const target = scrollTarget(
				data,
				scroll.offset,
				scroll.viewportHeight,
				maximumOffset(scroll),
			);
			if (target === undefined) return;
			scroll.offset = Math.max(0, Math.min(maximumOffset(scroll), target));
			options.tui.requestRender();
		},
		render: (width: number) => renderPreview(options, contentBox, scroll, width),
		invalidate: () => contentBox.invalidate(),
		dispose: releaseMouse,
	};
}

export async function showMarkdownPreview(
	ctx: ExtensionContext,
	options: MarkdownPreviewOptions,
): Promise<void> {
	if (ctx.mode !== "tui") return;

	await ctx.ui.custom<void>(
		(
			tui: TUI,
			theme: Theme,
			_keybindings: KeybindingsManager,
			done: (result: void) => void,
		) =>
			createMarkdownPreviewDialog({
				...options,
				tui,
				theme,
				markdown: createSharedMarkdownRendering(ctx, theme),
				close: done,
			}),
		{
			overlay: true,
			overlayOptions: {
				width: "90%",
				minWidth: 48,
				maxHeight: "84%",
				anchor: "center",
				margin: PANEL_MARGIN,
			},
		},
	);
}
