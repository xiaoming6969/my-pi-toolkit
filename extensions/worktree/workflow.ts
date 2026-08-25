import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { loadConfig } from "../tapd/core/config.js";
import { parseKeyword } from "../tapd/git/context.js";
import { branchPrefix, DEFAULT_GIT_WORKFLOW_POLICY } from "../tapd/git/policy.js";
import { fetchCommitKeyword } from "../tapd/git/tapd-api.js";
import { git, refExists } from "../tapd/git/repository.js";
import { readTapdSessionState } from "../tapd/sessions/session-state.js";
import {
	applyGitWorktree,
	createGitWorktree,
	defaultWorktreePath,
	gitStatus,
	removeGitWorktree,
} from "./operations.js";
import {
	appendWorktreeBinding,
	readWorktreeBinding,
	rebindSessionBranch,
	switchCurrentSessionCwd,
} from "./session.js";
import type { NewWorktreeTarget, WorktreeBinding } from "./types.js";

const runGit = (cwd: string, args: string[]) => git(cwd, args);

function temporaryBranch(): string {
	const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
	return `worktree/${stamp}`;
}

async function resolveTarget(
	ctx: ExtensionCommandContext,
): Promise<NewWorktreeTarget> {
	const state = readTapdSessionState(ctx.sessionManager.getEntries());
	if (!state)
		return { branch: temporaryBranch(), baseRef: "HEAD", source: "temporary" };
	const config = loadConfig();
	if (!config) throw new Error("当前是 TAPD 会话，但 ~/.pi/agent/tapd.json 未配置");
	const object = {
		workspaceId: state.workspaceId,
		objectId: state.itemId,
		kind: state.kind,
		name: state.itemName,
	};
	const keyword = parseKeyword(await fetchCommitKeyword(config, object), object);
	return {
		branch: `${branchPrefix(keyword.kind)}/${keyword.shortId}`,
		baseRef: DEFAULT_GIT_WORKFLOW_POLICY.baseRef,
		source: "tapd",
	};
}

export async function createWorktree(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
): Promise<string> {
	const existing = readWorktreeBinding(ctx.sessionManager.getEntries());
	if (existing?.phase === "active")
		throw new Error(`当前会话已绑定 worktree: ${existing.worktreePath}`);
	const root = await git(ctx.cwd, ["rev-parse", "--show-toplevel"]);
	const originalBranch = await git(root, ["branch", "--show-current"]);
	if (!originalBranch) throw new Error("detached HEAD 不支持创建 worktree");
	const target = await resolveTarget(ctx);
	if (await refExists(root, `refs/heads/${target.branch}`))
		throw new Error(`本地分支已存在: ${target.branch}`);
	if (!(await refExists(root, target.baseRef)))
		throw new Error(`基础分支不存在: ${target.baseRef}`);
	const path = defaultWorktreePath(root, target.branch);
	const { migrationWarning } = await createGitWorktree({
		git: runGit,
		root,
		branch: target.branch,
		baseRef: target.baseRef,
		path,
	});
	const head = await git(path, ["rev-parse", "--short", "HEAD"]);
	appendWorktreeBinding(pi, {
		originalCwd: resolve(root),
		originalBranch,
		worktreePath: resolve(path),
		worktreeBranch: target.branch,
		baseRef: target.baseRef,
		phase: "active",
	});
	rebindSessionBranch(pi, path, target.branch, head);
	const message = `已创建 ${target.source === "tapd" ? "TAPD " : ""}worktree\n分支: ${target.branch}\n目录: ${path}${migrationWarning ? `\n警告: ${migrationWarning}` : ""}`;
	await switchCurrentSessionCwd(ctx, path, message);
	return message;
}

function requireBinding(ctx: ExtensionCommandContext): WorktreeBinding {
	const binding = readWorktreeBinding(ctx.sessionManager.getEntries());
	if (!binding || binding.phase === "deleted")
		throw new Error("当前会话没有可用的 worktree 记录");
	return binding;
}

export async function applyWorktree(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
): Promise<string> {
	const binding = requireBinding(ctx);
	if (!existsSync(binding.originalCwd)) throw new Error("原工作目录不存在");
	if (binding.phase === "applied") {
		const message = `worktree 改动已 apply；会话已切回 ${binding.originalCwd}`;
		await switchCurrentSessionCwd(ctx, binding.originalCwd, message);
		return message;
	}
	if (!existsSync(binding.worktreePath)) throw new Error("worktree 目录不存在");
	const { moved, applyWarning } = await applyGitWorktree(
		runGit,
		binding.originalCwd,
		binding.worktreePath,
	);
	appendWorktreeBinding(pi, { ...binding, phase: "applied" });
	const head = await git(binding.originalCwd, ["rev-parse", "--short", "HEAD"]);
	rebindSessionBranch(pi, binding.originalCwd, binding.originalBranch, head);
	let message = `worktree 没有未提交改动；会话已切回 ${binding.originalCwd}`;
	if (moved) {
		message = `已将改动 apply 回 ${binding.originalCwd}；worktree 保留在 ${binding.worktreePath}`;
		if (applyWarning) message += `\n警告: ${applyWarning}`;
	}
	await switchCurrentSessionCwd(ctx, binding.originalCwd, message);
	return message;
}

export async function deleteWorktree(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
): Promise<string> {
	const binding = requireBinding(ctx);
	if (resolve(ctx.cwd) === resolve(binding.worktreePath))
		throw new Error("请先执行 /apply-worktree 切回原目录，再删除 worktree");
	if (!existsSync(binding.worktreePath)) {
		await git(binding.originalCwd, ["worktree", "prune"]);
		appendWorktreeBinding(pi, { ...binding, phase: "deleted" });
		return "worktree 目录已不存在，记录已清理";
	}
	const dirty = Boolean(await gitStatus(runGit, binding.worktreePath));
	if (dirty) {
		if (!ctx.hasUI) throw new Error("worktree 有未提交改动，非交互模式拒绝删除");
		const confirmed = await ctx.ui.confirm(
			"强制删除 worktree？",
			`未提交改动将永久丢失：\n${binding.worktreePath}`,
		);
		if (!confirmed) return "已取消删除 worktree";
	}
	await removeGitWorktree(
		runGit,
		binding.originalCwd,
		binding.worktreePath,
		dirty,
	);
	appendWorktreeBinding(pi, { ...binding, phase: "deleted" });
	return `已删除 worktree: ${binding.worktreePath}`;
}
