import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	SessionEntry,
	SessionManager as SessionManagerType,
} from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
	appendBindingCurrent,
	appendBindingTarget,
	createBinding,
} from "../session-branch-guard/binding.js";
import { rewriteSessionCwd } from "./session-file.js";
import { WORKTREE_BINDING_TYPE, type WorktreeBinding } from "./types.js";

const NO_SESSION_DIR = "临时会话无法绑定 worktree，请先保存会话";

function makeBinding(
	binding: Omit<WorktreeBinding, "version" | "updatedAt">,
): WorktreeBinding {
	return {
		...binding,
		version: 1,
		updatedAt: new Date().toISOString(),
	};
}

export function isWorktreeBinding(value: unknown): value is WorktreeBinding {
	if (!value || typeof value !== "object") return false;
	const b = value as Record<string, unknown>;
	return (
		b.version === 1 &&
		typeof b.originalCwd === "string" &&
		typeof b.originalBranch === "string" &&
		typeof b.worktreePath === "string" &&
		typeof b.worktreeBranch === "string" &&
		typeof b.baseRef === "string" &&
		(b.phase === "active" || b.phase === "applied" || b.phase === "deleted") &&
		typeof b.updatedAt === "string"
	);
}

export function readWorktreeBinding(
	entries: readonly SessionEntry[],
): WorktreeBinding | undefined {
	let latest: WorktreeBinding | undefined;
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== WORKTREE_BINDING_TYPE)
			continue;
		if (isWorktreeBinding(entry.data)) latest = entry.data;
	}
	return latest;
}

export function appendWorktreeBinding(
	pi: ExtensionAPI,
	binding: Omit<WorktreeBinding, "version" | "updatedAt">,
): WorktreeBinding {
	const value = makeBinding(binding);
	pi.appendEntry(WORKTREE_BINDING_TYPE, value);
	return value;
}

export function assertCanBindWorktree(ctx: ExtensionCommandContext): void {
	if (!ctx.sessionManager.getSessionDir()) throw new Error(NO_SESSION_DIR);
}

export function rebindSessionBranch(
	pi: ExtensionAPI,
	repoRoot: string,
	branch: string,
	head?: string,
): void {
	appendBindingCurrent(
		pi,
		createBinding({ isRepo: true, repoRoot, branch, head }, "rebound"),
	);
}

function appendWorktreeSetup(
	session: SessionManagerType,
	binding: Omit<WorktreeBinding, "version" | "updatedAt">,
	branch: string,
	head?: string,
): void {
	session.appendCustomEntry(WORKTREE_BINDING_TYPE, makeBinding(binding));
	appendBindingTarget(
		session,
		createBinding(
			{ isRepo: true, repoRoot: binding.worktreePath, branch, head },
			"created",
		),
	);
}

/** 在工作夹目录写出带绑定的新会话文件（新 session id，不拷贝当前对话）。 */
function createWorktreeSessionFile(
	worktreePath: string,
	binding: Omit<WorktreeBinding, "version" | "updatedAt">,
	branch: string,
	head?: string,
): string {
	const draft = SessionManager.create(worktreePath);
	const sessionFile = draft.getSessionFile();
	if (!sessionFile) throw new Error("无法创建会话文件路径");
	const header = draft.getHeader();
	if (!header) throw new Error("无法读取会话头");
	writeFileSync(sessionFile, `${JSON.stringify(header)}\n`, { flag: "wx" });
	appendWorktreeSetup(
		SessionManager.open(sessionFile, draft.getSessionDir()),
		binding,
		branch,
		head,
	);
	return sessionFile;
}

async function switchWithResult(
	ctx: ExtensionCommandContext,
	sessionFile: string,
	notifyMessage: string,
): Promise<void> {
	const result = await ctx.switchSession(sessionFile, {
		withSession: async (replacementCtx) => {
			await replacementCtx.sendMessage({
				customType: "worktree-command-result",
				content: notifyMessage,
				display: true,
			});
		},
	});
	if (result.cancelled) throw new Error("会话目录切换已取消");
}

export async function switchCurrentSessionCwd(
	ctx: ExtensionCommandContext,
	targetCwd: string,
	notifyMessage: string,
): Promise<void> {
	const sessionFile = ctx.sessionManager.getSessionFile();
	if (!sessionFile || !existsSync(sessionFile)) throw new Error(NO_SESSION_DIR);
	const oldCwd = rewriteSessionCwd(sessionFile, targetCwd);
	try {
		await switchWithResult(ctx, sessionFile, notifyMessage);
	} catch (error) {
		rewriteSessionCwd(sessionFile, oldCwd);
		throw error;
	}
}

export async function enterWorktreeSession(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	options: {
		worktreePath: string;
		worktreeBranch: string;
		head?: string;
		binding: Omit<WorktreeBinding, "version" | "updatedAt">;
		message: string;
	},
): Promise<void> {
	assertCanBindWorktree(ctx);
	const currentFile = ctx.sessionManager.getSessionFile();
	if (currentFile && existsSync(currentFile)) {
		appendWorktreeBinding(pi, options.binding);
		rebindSessionBranch(
			pi,
			options.worktreePath,
			options.worktreeBranch,
			options.head,
		);
		await switchCurrentSessionCwd(ctx, options.worktreePath, options.message);
		return;
	}
	const sessionFile = createWorktreeSessionFile(
		options.worktreePath,
		options.binding,
		options.worktreeBranch,
		options.head,
	);
	try {
		await switchWithResult(ctx, sessionFile, options.message);
	} catch (error) {
		unlinkSync(sessionFile);
		throw error;
	}
}
