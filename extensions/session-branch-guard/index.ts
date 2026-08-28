import type {
	AgentSettledEvent,
	ExtensionAPI,
	ExtensionContext,
	InputEvent,
	SessionShutdownEvent,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { getChatMode, isRestrictedMode } from "../chat-mode/state.js";
import { appendBindingCurrent, createBinding, readBinding } from "./binding.js";
import {
	applyGuardStatus,
	followBindingIfBranchDiffers,
	liveDriftDecision,
	type GuardState,
} from "./drift.js";
import { readGitContext } from "./git.js";
import { compareBinding } from "./guard.js";
import { setSessionBranchModeHandler } from "./mode-hook.js";
import { registerResumeGuard } from "./resume.js";
import {
	resolveBranchMismatch,
	type RebindWriter,
} from "./resolution.js";
import type {
	GitContext,
	MismatchKind,
	SessionBranchBinding,
} from "./types.js";
import { registerSessionBranchCommand } from "./commands.js";

/** 无 UI（print/json）场景的错误输出，避免 console.* 规则告警。 */
function logHeadless(message: string): void {
	process.stderr.write(`[session-branch] ${message}\n`);
}

function currentRebindWriter(pi: ExtensionAPI): RebindWriter {
	return { write: (binding) => appendBindingCurrent(pi, binding) };
}

export function sessionBranchGuard(pi: ExtensionAPI): void {
	let guardState: GuardState = "clear";
	let statusNotified = false;

	const setGuard = (ctx: ExtensionContext, next: GuardState): void => {
		if (guardState !== next) statusNotified = false;
		guardState = next;
		applyGuardStatus(ctx, next);
	};

	const clearGuard = (ctx: ExtensionContext): void => {
		statusNotified = false;
		guardState = "clear";
		applyGuardStatus(ctx, "clear");
	};

	/**
	 * 处理已存在 binding 的不匹配：repo-differs / detached 只阻塞并提示；
	 * branch-differs 走完整解决流程。返回是否已解决（允许继续）。
	 */
	async function handleMismatch(
		ctx: ExtensionContext,
		binding: SessionBranchBinding,
		gitContext: GitContext,
		mismatch: MismatchKind,
		writer: RebindWriter,
	): Promise<boolean> {
		if (mismatch === "repo-differs") {
			setGuard(ctx, "hard");
			const message = `该会话绑定的是另一个仓库（${binding.repoRoot}），无法在当前位置继续；请先 cd 到对应仓库再恢复`;
			if (ctx.hasUI) ctx.ui.notify(message, "warning");
			else logHeadless(message);
			return false;
		}
		if (mismatch === "detached") {
			setGuard(ctx, "hard");
			const message =
				"当前处于 detached HEAD，会话已绑定具体分支；请先手动切换到一个分支，或执行 /session-branch rebind 重新绑定";
			if (ctx.hasUI) ctx.ui.notify(message, "warning");
			else logHeadless(message);
			return false;
		}
		if (!ctx.hasUI) {
			setGuard(ctx, "hard");
			logHeadless(
				`会话绑定分支 ${binding.gitBranch}，当前 ${gitContext.branch ?? "(detached)"}；无 UI 环境不自动执行 Git 变更，已保持阻塞`,
			);
			return false;
		}
		setGuard(ctx, "hard");
		const outcome = await resolveBranchMismatch(
			pi,
			ctx,
			binding,
			gitContext,
			writer,
		);
		if (outcome.kind === "switched" || outcome.kind === "rebound") {
			clearGuard(ctx);
			return true;
		}
		if (outcome.kind === "failed")
			ctx.ui.notify(`分支不匹配未解决：${outcome.error}`, "warning");
		return false;
	}

	pi.on(
		"session_start",
		async (event: SessionStartEvent, ctx: ExtensionContext) => {
			const gitContext = await readGitContext(pi, ctx.cwd);
			if (!gitContext.isRepo || !gitContext.repoRoot) return;
			const entries = ctx.sessionManager.getEntries();
			const binding = readBinding(entries);
			if (!binding) {
				if (!gitContext.branch) return;
				const fresh =
					event.reason === "new" ||
					event.reason === "fork" ||
					(event.reason === "startup" && entries.length === 0);
				appendBindingCurrent(
					pi,
					createBinding(gitContext, fresh ? "created" : "adopted"),
				);
				if (!fresh)
					ctx.ui.notify(
						`已将此会话关联到当前分支 ${gitContext.branch}`,
						"info",
					);
				return;
			}
			const mismatch = compareBinding(binding, gitContext);
			if (mismatch === "same") return;
			await handleMismatch(
				ctx,
				binding,
				gitContext,
				mismatch,
				currentRebindWriter(pi),
			);
		},
	);

	registerResumeGuard(pi);

	pi.on("input", async (event: InputEvent, ctx: ExtensionContext) => {
		if (event.source === "extension") return;
		const gitContext = await readGitContext(pi, ctx.cwd);
		if (!gitContext.isRepo || !gitContext.repoRoot) return;
		const binding = readBinding(ctx.sessionManager.getEntries());
		if (!binding) return;
		const mismatch = compareBinding(binding, gitContext);
		const action = liveDriftDecision(mismatch, {
			restrictedMode: isRestrictedMode(getChatMode()),
			hasUI: ctx.hasUI,
			hardBlocked: guardState === "hard",
			source: "input",
		});
		if (action === "none") {
			if (guardState !== "clear") clearGuard(ctx);
			return;
		}
		if (action === "advise") {
			setGuard(ctx, "advisory");
			if (!statusNotified) {
				statusNotified = true;
				ctx.ui.notify(
					`当前分支 ${gitContext.branch ?? "(detached)"} 与会话绑定分支 ${binding.gitBranch} 不一致；Ask/Plan 下可继续只读交互，切到 Build 或运行 /session-branch resolve 后再写入`,
					"warning",
				);
			}
			return;
		}
		if (!ctx.hasUI) {
			setGuard(ctx, "hard");
			logHeadless(
				`已阻止输入：会话绑定分支 ${binding.gitBranch}，当前 ${gitContext.branch ?? "(detached)"}`,
			);
			return { action: "handled" };
		}
		setGuard(ctx, "hard");
		if (!statusNotified) {
			statusNotified = true;
			ctx.ui.notify(
				`当前分支 ${gitContext.branch ?? "(detached)"} 与会话绑定分支 ${binding.gitBranch} 不一致，已阻止本次输入；请运行 /session-branch resolve 处理`,
				"warning",
			);
		}
		return { action: "handled" };
	});

	pi.on(
		"agent_settled",
		async (_event: AgentSettledEvent, ctx: ExtensionContext) => {
			const gitContext = await readGitContext(pi, ctx.cwd);
			if (!gitContext.isRepo || !gitContext.repoRoot) return;
			const binding = readBinding(ctx.sessionManager.getEntries());
			const mismatch = compareBinding(binding, gitContext);
			if (
				liveDriftDecision(mismatch, {
					restrictedMode: isRestrictedMode(getChatMode()),
					hasUI: ctx.hasUI,
					hardBlocked: guardState === "hard",
					source: "settled",
				}) !== "follow"
			)
				return;
			if (!followBindingIfBranchDiffers(pi, binding, gitContext)) return;
			clearGuard(ctx);
			const message = `已跟随当前分支 ${gitContext.branch}`;
			if (ctx.hasUI) ctx.ui.notify(message, "info");
			else logHeadless(message);
		},
	);

	setSessionBranchModeHandler(async (mode, previous, ctx) => {
		if (isRestrictedMode(mode) || !isRestrictedMode(previous)) return;
		const gitContext = await readGitContext(pi, ctx.cwd);
		if (!gitContext.isRepo || !gitContext.repoRoot) return;
		const binding = readBinding(ctx.sessionManager.getEntries());
		if (!binding) return;
		const mismatch = compareBinding(binding, gitContext);
		if (mismatch === "same") {
			if (guardState !== "clear") clearGuard(ctx);
			return;
		}
		await handleMismatch(
			ctx,
			binding,
			gitContext,
			mismatch,
			currentRebindWriter(pi),
		);
	});

	pi.on(
		"session_shutdown",
		(_event: SessionShutdownEvent, ctx: ExtensionContext) => {
			statusNotified = false;
			guardState = "clear";
			applyGuardStatus(ctx, "clear");
		},
	);

	registerSessionBranchCommand(pi, {
		getState: () => guardState,
		handleMismatch,
	});
}
