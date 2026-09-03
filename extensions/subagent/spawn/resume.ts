import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	getBackgroundSubagent,
	isBackgroundJobActive,
} from "../../shared/subagent/background.js";
import { getLiveSubagent } from "../../shared/subagent/registry.js";
import {
	latestSessionFile,
	subagentRunDir,
} from "../../shared/subagent/run-paths.js";

export interface ResumeSource {
	subagentId: string;
	sessionFile: string;
}

function launchParentSession(runDir: string): string | undefined {
	try {
		const launch = JSON.parse(
			readFileSync(join(runDir, "launch.json"), "utf8"),
		) as { parentSessionId?: unknown };
		return typeof launch.parentSessionId === "string"
			? launch.parentSessionId
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * Resolve the session file a new child should fork from. The source must
 * belong to the current parent session and must have stopped running, so the
 * forked transcript is complete. Retained run directories on disk qualify even
 * after the live handle is gone.
 */
export function resolveResumeSource(
	resumeFrom: string,
	parentSessionId: string,
	runDirFor: (id: string) => string = subagentRunDir,
): ResumeSource {
	const id = resumeFrom.trim();
	if (!id) throw new Error("resumeFrom 不能为空");
	const live = getLiveSubagent(id);
	if (live) {
		if (live.parentSessionId !== parentSessionId)
			throw new Error("不能续接其他主会话创建的子 Agent");
		if (live.status === "starting" || live.status === "running")
			throw new Error(`子 Agent ${id} 仍在运行，等待其结束后再 resume`);
	}
	const job = getBackgroundSubagent(id);
	if (job) {
		if (job.parentSessionId !== parentSessionId)
			throw new Error("不能续接其他主会话创建的子 Agent");
		if (isBackgroundJobActive(job))
			throw new Error(`后台子 Agent ${id} 仍在运行，等待其结束后再 resume`);
	}
	const runDir = runDirFor(id);
	if (!live && !job) {
		if (!existsSync(runDir)) throw new Error(`未找到可续接的子 Agent: ${id}`);
		const owner = launchParentSession(runDir);
		if (owner !== undefined && owner !== parentSessionId)
			throw new Error("不能续接其他主会话创建的子 Agent");
	}
	const sessionFile = latestSessionFile(runDir);
	if (!sessionFile)
		throw new Error(
			`子 Agent ${id} 没有可续接的 session 记录（一次性 inline 子进程不保存 session）`,
		);
	return { subagentId: id, sessionFile };
}
