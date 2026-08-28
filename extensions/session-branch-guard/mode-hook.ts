import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ChatMode } from "../chat-mode/state.js";

type ModeChangeHandler = (
	mode: ChatMode,
	previous: ChatMode,
	ctx: ExtensionContext,
) => void | Promise<void>;

let handler: ModeChangeHandler | undefined;

export function setSessionBranchModeHandler(
	next: ModeChangeHandler | undefined,
): void {
	handler = next;
}

export function notifySessionBranchModeChange(
	mode: ChatMode,
	previous: ChatMode,
	ctx: ExtensionContext,
): void {
	void handler?.(mode, previous, ctx);
}
