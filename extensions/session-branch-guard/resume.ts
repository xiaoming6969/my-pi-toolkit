import {
	SessionManager,
	type ExtensionAPI,
	type ExtensionContext,
	type SessionBeforeSwitchEvent,
} from "@earendil-works/pi-coding-agent";
import { readBinding } from "./binding.js";
import { readGitContext } from "./git.js";
import { compareBinding } from "./guard.js";
import { resolveBranchMismatch, targetRebindWriter } from "./resolution.js";

/** /resume 前置拦截：按目标会话自身 cwd 校验，不改 live 漂移策略。 */
export function registerResumeGuard(pi: ExtensionAPI): void {
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
			if (!gitContext.isRepo || !gitContext.repoRoot) return;
			const mismatch = compareBinding(binding, gitContext);
			if (mismatch === "same") return;
			if (mismatch === "repo-differs") {
				ctx.ui.notify(
					`目标会话绑定仓库（${binding.repoRoot}）与会话目录（${sessionCwd}）不一致，已取消恢复`,
					"warning",
				);
				return { cancel: true };
			}
			if (mismatch === "detached") {
				ctx.ui.notify(
					"会话目录处于 detached HEAD，请先在该仓库手动切换分支后再恢复该会话",
					"warning",
				);
				return { cancel: true };
			}
			if (!ctx.hasUI) {
				ctx.ui.notify(
					`目标会话绑定分支 ${binding.gitBranch}，会话目录当前 ${gitContext.branch}；无 UI 环境不自动执行 Git 变更，已取消恢复`,
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
					const verify = SessionManager.open(event.targetSessionFile);
					const latest = readBinding(verify.getEntries());
					if (latest?.gitBranch === gitContext.branch) return;
				} catch {
					// fallthrough：校验失败按取消处理
				}
				ctx.ui.notify("rebind 未能持久化到目标会话，已取消恢复", "error");
			}
			return { cancel: true };
		},
	);
}
