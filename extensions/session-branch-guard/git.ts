import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { GitContext } from "./types.js";

/** 平台无关的仓库路径规范化（Windows 处理盘符/大小写）。 */
export function normalizeRepoPath(path: string): string {
	const normalized = resolve(path);
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function textOutput(result: { code: number; stdout: string }): string | undefined {
	if (result.code !== 0) return undefined;
	const value = result.stdout.trim();
	return value || undefined;
}

/** 读取当前工作区 Git 上下文；非 Git 目录返回 isRepo=false。 */
export async function readGitContext(
	pi: ExtensionAPI,
	cwd: string,
): Promise<GitContext> {
	const rootResult = await pi.exec("git", ["rev-parse", "--show-toplevel"], {
		cwd,
	});
	const repoRoot = textOutput(rootResult);
	if (!repoRoot) return { isRepo: false };

	const [branchResult, headResult, commonResult] = await Promise.all([
		pi.exec("git", ["branch", "--show-current"], { cwd: repoRoot }),
		pi.exec("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot }),
		pi.exec("git", ["rev-parse", "--git-common-dir"], { cwd: repoRoot }),
	]);
	const commonRaw = textOutput(commonResult);
	return {
		isRepo: true,
		repoRoot,
		branch: textOutput(branchResult),
		head: textOutput(headResult),
		gitCommonDir: commonRaw
			? normalizeRepoPath(resolve(repoRoot, commonRaw))
			: undefined,
	};
}

/** 检查本地分支是否存在。 */
export async function branchExists(
	pi: ExtensionAPI,
	repoRoot: string,
	branch: string,
): Promise<boolean> {
	const result = await pi.exec(
		"git",
		["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`],
		{ cwd: repoRoot },
	);
	return result.code === 0;
}

/** 普通 switch，绝不使用 --force / reset / clean。 */
export async function switchBranch(
	pi: ExtensionAPI,
	repoRoot: string,
	branch: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const result = await pi.exec("git", ["switch", branch], { cwd: repoRoot });
	if (result.code !== 0)
		return {
			ok: false,
			error: result.stderr.trim() || `git switch ${branch} 失败`,
		};
	return { ok: true };
}

/** 截断 git stderr 用于展示，避免长输出撑破 UI。 */
export function summarizeError(error: string, maxLength = 300): string {
	const cleaned = error.replace(/\s+/g, " ").trim();
	if (cleaned.length <= maxLength) return cleaned;
	return `${cleaned.slice(0, maxLength)}…`;
}
