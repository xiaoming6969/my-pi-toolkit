import { join } from "node:path";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type KeybindingsManager,
	type OverlayHandle,
	type TUI,
} from "@earendil-works/pi-tui";
import type { LiveSubagentRun } from "../shared/subagent/registry.js";
import { SUBAGENT_RUNS_ROOT } from "../shared/subagent/run-paths.js";
import { createSharedMarkdownRendering } from "../shared/tui/markdown.js";
import { STANDARD_OVERLAY_OPTIONS } from "../shared/tui/overlay-shell.js";
import type { SubagentDetailItem } from "./detail-navigation.js";
import { createSubagentOverlay } from "./overlay-panel.js";

export type SubagentOverlayCloseReason =
	| "closed"
	| "yielded"
	| "settled"
	| "aborted";

function isSettledStatus(status: string): boolean {
	return status === "completed" || status === "failed";
}

async function showOverlay(
	ctx: ExtensionContext,
	items: SubagentDetailItem[],
	initialId: string,
	watch?: { run: LiveSubagentRun; abortOnEscape: boolean },
): Promise<SubagentOverlayCloseReason> {
	let component: Component | undefined;
	let handle: OverlayHandle | undefined;
	const unsubscribeInput = ctx.ui.onTerminalInput((data: string) => {
		if (!component || !handle || handle.isFocused()) return;
		component.handleInput?.(data);
		return { consume: true };
	});
	try {
		return await ctx.ui.custom<SubagentOverlayCloseReason>(
			(
				tui: TUI,
				theme: Theme,
				keybindings: KeybindingsManager,
				done: (value: SubagentOverlayCloseReason) => void,
			) => {
				let finished = false;
				let unsubscribeWatch: (() => void) | undefined;
				const finish = (reason: SubagentOverlayCloseReason) => {
					if (finished) return;
					finished = true;
					unsubscribeWatch?.();
					done(reason);
				};
				unsubscribeWatch = watch?.run.subscribe(() => {
					if (isSettledStatus(watch.run.status)) finish("settled");
				});
				component = createSubagentOverlay({
					items,
					initialId,
					tui,
					requestRender: () => tui.requestRender(),
					theme,
					keybindings,
					markdown: createSharedMarkdownRendering(ctx, theme),
					escapeHint: watch?.abortOnEscape ? "Esc cancel" : undefined,
					close: () => {
						if (watch?.abortOnEscape) {
							watch.run.abort();
							finish("aborted");
							return;
						}
						finish(handle?.isFocused() === false ? "yielded" : "closed");
					},
				});
				if (watch && isSettledStatus(watch.run.status))
					queueMicrotask(() => finish("settled"));
				return component;
			},
			{
				...STANDARD_OVERLAY_OPTIONS,
				onHandle: (overlayHandle: OverlayHandle) => {
					handle = overlayHandle;
				},
			},
		);
	} finally {
		unsubscribeInput();
	}
}

export async function openSubagentOverlay(
	ctx: ExtensionContext,
	items: SubagentDetailItem[],
	initialId: string,
): Promise<SubagentOverlayCloseReason> {
	if (items.length === 0) return "closed";
	return showOverlay(ctx, items, initialId);
}

export async function watchLiveSubagentOverlay(
	ctx: ExtensionContext,
	run: LiveSubagentRun,
): Promise<SubagentOverlayCloseReason> {
	const id = join(SUBAGENT_RUNS_ROOT, run.id);
	return showOverlay(ctx, [{ id, load: () => run }], id, {
		run,
		abortOnEscape: true,
	});
}
