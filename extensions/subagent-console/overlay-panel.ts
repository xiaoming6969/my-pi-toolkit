import {
	getMarkdownTheme,
	rawKeyHint,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	Markdown,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	type Component,
	type KeybindingsManager,
	type TUI,
} from "@earendil-works/pi-tui";
import type { SharedMarkdownRendering } from "../shared/tui/markdown.js";
import {
	overlayInnerWidth,
	overlayViewportHeight,
	renderOverlayShell,
} from "../shared/tui/overlay-shell.js";
import {
	formatDuration,
	statusGlyph,
	thinkingLevelText,
	type VisualStatus,
} from "../shared/tui/visual-language.js";
import {
	createSubagentDetailNavigator,
	type SubagentDetailItem,
	type SubagentView,
} from "./detail-navigation.js";
import {
	acquireMouseTracking,
	mouseWheelDirection,
	overlayWheelSupported,
} from "./mouse.js";

function visualStatus(status: string): VisualStatus {
	if (status === "starting" || status === "running") return "active";
	if (status === "completed") return "success";
	if (status === "failed") return "error";
	return "pending";
}

export function subagentOperationalText(
	run: SubagentView,
	now = Date.now(),
): string {
	const parts: string[] = [];
	if ((run.queuedCount ?? 0) > 0) parts.push(`queued ${run.queuedCount}`);
	if (run.status === "running" && run.turnStartedAt) {
		const startedAt = Date.parse(run.turnStartedAt);
		if (Number.isFinite(startedAt))
			parts.push(`running ${formatDuration(now - startedAt)}`);
	} else if (run.idleDeadlineAt) {
		const deadline = Date.parse(run.idleDeadlineAt);
		if (Number.isFinite(deadline))
			parts.push(`idle ${formatDuration(deadline - now)}`);
	}
	return parts.join(" · ");
}

export function renderSubagentHeader(
	run: SubagentView,
	position: string,
	theme: Theme,
	width: number,
	now = Date.now(),
): string {
	const operation = subagentOperationalText(run, now);
	const prefix = `${theme.bold(theme.fg("text", "SUBAGENT"))} ${theme.fg("dim", position)} `;
	const statusText = `${statusGlyph(theme, visualStatus(run.status))} ${theme.fg("muted", run.status.toUpperCase())}`;
	const operationText = operation ? ` ${theme.fg("muted", `· ${operation}`)}` : "";
	const rightCore = `${statusText}${operationText}`;
	const gap = 2;
	const title = theme.fg(
		"accent",
		truncateToWidth(
			run.title,
			Math.max(0, width - visibleWidth(prefix) - visibleWidth(rightCore) - gap),
			"…",
		),
	);
	const left = `${prefix}${title}`;
	let right = rightCore;
	let leftover = width - visibleWidth(left) - visibleWidth(right);
	const extras: string[] = [];
	if (width >= 80 && run.model)
		extras.push(theme.fg("muted", ` · ${run.model}`));
	if (width >= 100 && run.reusable && run.id)
		extras.push(theme.fg("muted", ` · #${run.id.slice(0, 8)} · turn ${run.turnCount ?? 0}`));
	if (width >= 120 && run.thinkingLevel)
		extras.push(`${theme.fg("muted", " · ")}${thinkingLevelText(run.thinkingLevel, theme, true)}`);
	for (const extra of extras) {
		const extraWidth = visibleWidth(extra);
		if (leftover - extraWidth < gap) break;
		right += extra;
		leftover -= extraWidth;
	}
	return truncateToWidth(
		`${left}${" ".repeat(Math.max(0, leftover))}${right}`,
		width,
		"…",
	);
}

function configuredHint(
	keybindings: KeybindingsManager,
	id: "app.thinking.toggle" | "app.tools.expand",
	description: string,
	fallback: string,
): string {
	const key = keybindings.getKeys(id)[0];
	return key ? rawKeyHint(key, description) : fallback;
}

interface SubagentOverlayPanelOptions {
	items: SubagentDetailItem[];
	initialId: string;
	tui: TUI;
	requestRender: () => void;
	theme: Theme;
	keybindings: KeybindingsManager;
	markdown: SharedMarkdownRendering;
	close: () => void;
	escapeHint?: string;
}

export function createSubagentOverlay(
	options: SubagentOverlayPanelOptions,
): Component & { dispose(): void } {
	const navigator = createSubagentDetailNavigator(
		options.items,
		options.initialId,
		options.tui,
		options.requestRender,
		options.markdown,
	);
	const releaseMouseTracking = acquireMouseTracking(options.tui);
	let scrollOffset = 0;
	let contentHeight = 0;
	let viewportHeight = 1;
	let autoFollow = true;
	let toolOutputExpanded = false;
	let thinkingHidden = true;
	let disposed = false;
	const refreshTimer = setInterval(options.requestRender, 1_000);
	refreshTimer.unref?.();
	const cleanup = () => {
		if (disposed) return;
		disposed = true;
		clearInterval(refreshTimer);
		navigator.dispose();
		releaseMouseTracking();
	};

	const scrollTo = (offset: number, follow: boolean) => {
		const maximum = Math.max(0, contentHeight - viewportHeight);
		scrollOffset = Math.max(0, Math.min(offset, maximum));
		autoFollow = follow;
		options.requestRender();
	};

	const switchRun = (delta: -1 | 1) => {
		if (!navigator.switch(delta)) return;
		scrollOffset = 0;
		contentHeight = 0;
		autoFollow = true;
		options.requestRender();
	};

	const handleDisplayToggle = (data: string): boolean => {
		if (options.keybindings.matches(data, "app.thinking.toggle"))
			thinkingHidden = !thinkingHidden;
		else if (options.keybindings.matches(data, "app.tools.expand"))
			toolOutputExpanded = !toolOutputExpanded;
		else return false;
		options.requestRender();
		return true;
	};

	const handleScrollKey = (data: string) => {
		const maximum = Math.max(0, contentHeight - viewportHeight);
		const commands = [
			{ key: "up", offset: scrollOffset - 1, follow: false },
			{
				key: "down",
				offset: scrollOffset + 1,
				follow: scrollOffset + 1 >= maximum,
			},
			{ key: "pageUp", offset: scrollOffset - viewportHeight, follow: false },
			{
				key: "pageDown",
				offset: scrollOffset + viewportHeight,
				follow: scrollOffset + viewportHeight >= maximum,
			},
			{ key: "home", offset: 0, follow: false },
			{ key: "end", offset: maximum, follow: true },
		] as const;
		const command = commands.find(({ key }) => matchesKey(data, key));
		if (command) scrollTo(command.offset, command.follow);
	};

	const handleInput = (data: string) => {
		const wheelDirection = mouseWheelDirection(data);
		if (wheelDirection) {
			const maximum = Math.max(0, contentHeight - viewportHeight);
			const nextOffset = scrollOffset + wheelDirection * 3;
			scrollTo(nextOffset, wheelDirection > 0 && nextOffset >= maximum);
			return;
		}
		if (handleDisplayToggle(data)) return;
		if (matchesKey(data, "escape")) {
			cleanup();
			options.close();
			return;
		}
		if (matchesKey(data, "left")) return switchRun(-1);
		if (matchesKey(data, "right")) return switchRun(1);
		handleScrollKey(data);
	};

	const render = (width: number): string[] => {
		const innerWidth = overlayInnerWidth(width);
		viewportHeight = overlayViewportHeight(options.tui.terminal.rows);
		const run = navigator.currentRun();
		const renderEntry = navigator.renderEntry();
		const renderedEntries = run.entries?.flatMap((entry) =>
			renderEntry(entry, innerWidth, {
				toolsExpanded: toolOutputExpanded,
				thinkingHidden,
			}),
		);
		const renderedMarkdown = run.markdown
			? new Markdown(
					run.markdown,
					0,
					0,
					getMarkdownTheme(),
					undefined,
					options.markdown.options("assistant"),
				).render(innerWidth)
			: [];
		const content = renderedEntries?.length
			? renderedEntries
			: renderedMarkdown;
		contentHeight = content.length;
		const maximum = Math.max(0, content.length - viewportHeight);
		scrollOffset = autoFollow ? maximum : Math.min(scrollOffset, maximum);
		const visible = content.slice(scrollOffset, scrollOffset + viewportHeight);
		while (visible.length < viewportHeight) visible.push("");
		const header = renderSubagentHeader(
			run,
			navigator.position(),
			options.theme,
			innerWidth,
		);
		const endLine = Math.min(contentHeight, scrollOffset + viewportHeight);
		const position = contentHeight
			? `${scrollOffset + 1}-${endLine}/${contentHeight}`
			: "0/0";
		const thinkingHint = configuredHint(
			options.keybindings,
			"app.thinking.toggle",
			thinkingHidden ? "show thinking" : "hide thinking",
			"toggle thinking",
		);
		const toolsHint = configuredHint(
			options.keybindings,
			"app.tools.expand",
			toolOutputExpanded ? "collapse tools" : "expand tools",
			"toggle tools",
		);
		const scrollHint = overlayWheelSupported(options.tui)
			? "↑↓/wheel scroll"
			: "↑↓/PgUp/PgDn scroll";
		const footer = options.theme.fg(
			"dim",
			`${options.escapeHint ?? "Esc close"} · ←/→ switch · ${scrollHint} · ${thinkingHint} · ${toolsHint} · End follow · ${position}`,
		);
		return renderOverlayShell(options.theme, width, {
			header,
			body: visible,
			footer,
		});
	};

	return {
		handleInput,
		render,
		invalidate: () => {},
		dispose: cleanup,
	};
}
