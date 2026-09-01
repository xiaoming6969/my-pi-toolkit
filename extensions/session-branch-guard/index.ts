import {
	SessionManager,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type InputEvent,
	type SessionBeforeSwitchEvent,
	type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import {
	appendBindingCurrent,
	createBinding,
	readBinding,
} from "./binding.js";
import { compareBinding } from "./compare.js";
import { readGitContext } from "./git.js";
import {
	formatBindingStatus,
	shouldBindOnInput,
	shouldCheckSession,
} from "./policy.js";
import {
	notify,
	resolveBranchMismatch,
	targetRebindWriter,
	type RebindWriter,
} from "./resolve.js";
import type { GitContext, SessionBranchBinding } from "./types.js";

function currentRebindWriter(pi: ExtensionAPI): RebindWriter {
	return { write: (binding) => appendBindingCurrent(pi, binding) };
}

function mismatchSummary(
	binding: SessionBranchBinding,
	gitContext: GitContext,
): string {
	return `会话绑定分支 ${binding.gitBranch}，当前 ${gitContext.branch ?? "(detached)"}`;
}

export function sessionBranchGuard(pi: ExtensionAPI): void {
	pi.on("input", async (event: InputEvent, ctx: ExtensionContext) => {
		const entries = ctx.sessionManager.getEntries();
		if (!shouldBindOnInput(event.source, Boolean(readBinding(entries)))) return;
		const gitContext = await readGitContext(pi, ctx.cwd);
		if (!gitContext.isRepo || !gitContext.branch) return;
		appendBindingCurrent(pi, createBinding(gitContext, "created"));
	});

	pi.on(
		"session_before_switch",
		async (event: SessionBeforeSwitchEvent, ctx: ExtensionContext) => {
			if (event.reason !== "resume" || !event.targetSessionFile) return;
			let target: SessionManager;
			try {
				target = SessionManager.open(event.targetSessionFile);
			} catch {
				return;
			}
			const binding = readBinding(target.getEntries());
			if (!binding) return;
			const sessionCwd = target.getCwd() || ctx.cwd;
			const gitContext = await readGitContext(pi, sessionCwd);
			if (compareBinding(binding, gitContext) === "same") return;
			if (!ctx.hasUI) {
				notify(
					ctx,
					`${mismatchSummary(binding, gitContext)}；无 UI 环境不自动执行 Git 变更，已取消恢复`,
					"warning",
				);
				return { cancel: true };
			}
			const outcome = await resolveBranchMismatch(
				pi,
				ctx,
				binding,
				gitContext,
				targetRebindWriter(target),
			);
			if (outcome.kind === "switched") return;
			if (outcome.kind === "rebound") {
				try {
					const latest = readBinding(
						SessionManager.open(event.targetSessionFile).getEntries(),
					);
					if (latest?.gitBranch === gitContext.branch) return;
				} catch {
					// fallthrough
				}
				notify(ctx, "重新绑定未能持久化到目标会话，已取消恢复", "error");
			}
			return { cancel: true };
		},
	);

	pi.on(
		"session_start",
		async (event: SessionStartEvent, ctx: ExtensionContext) => {
			if (!shouldCheckSession(event.reason)) return;
			const gitContext = await readGitContext(pi, ctx.cwd);
			const binding = readBinding(ctx.sessionManager.getEntries());
			if (!binding) return;
			if (compareBinding(binding, gitContext) === "same") return;
			if (!ctx.hasUI) {
				notify(
					ctx,
					`${mismatchSummary(binding, gitContext)}；无 UI 环境不自动执行 Git 变更`,
					"warning",
				);
				return;
			}
			await resolveBranchMismatch(
				pi,
				ctx,
				binding,
				gitContext,
				currentRebindWriter(pi),
			);
		},
	);

	pi.registerCommand("session-branch", {
		description: "查看会话绑定的 Git 分支；不一致时可切回或改绑",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const gitContext = await readGitContext(pi, ctx.cwd);
			const binding = readBinding(ctx.sessionManager.getEntries());
			const mismatch = compareBinding(binding, gitContext);
			notify(
				ctx,
				formatBindingStatus({
					sessionId: ctx.sessionManager.getSessionId(),
					binding,
					gitContext,
					mismatch,
				}),
				"info",
			);
			if (mismatch === "same" || !binding) return;
			if (!ctx.hasUI) return;
			await resolveBranchMismatch(
				pi,
				ctx,
				binding,
				gitContext,
				currentRebindWriter(pi),
			);
		},
	});
}
