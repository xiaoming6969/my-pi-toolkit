import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { appendBindingCurrent, createBinding } from "./binding.js";
import { compareBinding } from "./guard.js";
import type { GitContext, MismatchKind, SessionBranchBinding } from "./types.js";

const STATUS_KEY = "session-branch";

export type GuardState = "clear" | "advisory" | "hard";
type LiveDriftAction = "none" | "follow" | "advise" | "block";

interface LiveDriftOptions {
	restrictedMode: boolean;
	hasUI: boolean;
	hardBlocked: boolean;
	source: "input" | "settled";
}

/**
 * 仅在同仓库 symbolic 分支变化时写入 rebound。
 * 无绑定、跨仓、detached 或已一致时不写，也不执行 Git 变更。
 */
export function followBindingIfBranchDiffers(
	pi: ExtensionAPI,
	binding: SessionBranchBinding | undefined,
	gitContext: GitContext,
): boolean {
	if (!binding) return false;
	if (compareBinding(binding, gitContext) !== "branch-differs") return false;
	appendBindingCurrent(pi, createBinding(gitContext, "rebound"));
	return true;
}

/**
 * Live 漂移决策。resume / session_start 不走这里。
 * settled 只跟随同仓切分支；input 按模式分劝告或硬阻塞。
 */
export function liveDriftDecision(
	mismatch: MismatchKind,
	options: LiveDriftOptions,
): LiveDriftAction {
	if (mismatch === "same") return "none";
	if (options.source === "settled") {
		return mismatch === "branch-differs" ? "follow" : "none";
	}
	if (!options.hasUI) return "block";
	if (mismatch === "repo-differs" || mismatch === "detached") return "block";
	if (options.hardBlocked) return "block";
	if (options.restrictedMode) return "advise";
	return "block";
}

export function applyGuardStatus(
	ctx: ExtensionContext,
	state: GuardState,
): void {
	if (state === "clear") {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}
	ctx.ui.setStatus(STATUS_KEY, state === "advisory" ? "advisory" : "blocked");
}

export function guardStateLabel(state: GuardState): string {
	if (state === "hard") return "已阻塞（分支不匹配）";
	if (state === "advisory") return "提示中（分支不匹配）";
	return "正常";
}
