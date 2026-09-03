import {
	getBackgroundSubagent,
	type BackgroundSubagentJob,
} from "../../shared/subagent/background.js";
import { truncateSubagentOutput } from "../../shared/subagent/output-limit.js";
import {
	getLiveSubagent,
	type LiveSubagentRun,
} from "../../shared/subagent/registry.js";
import { assistantText } from "../../shared/subagent/rpc-protocol.js";
import { previewToolCall } from "./render.js";
import { describeRunResult } from "./result-text.js";

const TRUNCATED_NOTICE =
	"[子 Agent 输出已截断；完整输出保存在工具 details 中。]";

export interface SubagentStatusView {
	subagentId: string;
	title: string;
	status: string;
	/** Set for settled background jobs; live-only runs report their registry status. */
	error?: string;
}

export function jobStatusLine(job: BackgroundSubagentJob): string {
	const suffix = job.error ? ` — ${job.error}` : "";
	return `- ${job.id} (${job.title}): ${job.status}${suffix}`;
}

export function jobStatusView(job: BackgroundSubagentJob): SubagentStatusView {
	return {
		subagentId: job.id,
		title: job.title,
		status: job.status,
		error: job.error,
	};
}

function lastAssistantText(run: LiveSubagentRun): string {
	for (let index = run.entries.length - 1; index >= 0; index--) {
		const entry = run.entries[index];
		if (entry.kind !== "assistant") continue;
		const text = assistantText(entry.message);
		if (text) return text;
	}
	return "";
}

export interface SubagentOutputView {
	subagentId: string;
	title: string;
	status: string;
	text: string;
	output?: string;
	truncated: boolean;
}

/**
 * Resolve the readable state of a subagent id: a background job first, then a
 * live registry run (foreground or reusable child). Running children report
 * progress instead of a final result.
 */
export function describeSubagentOutput(
	subagentId: string,
	parentSessionId: string,
): SubagentOutputView {
	const id = subagentId.trim();
	if (!id) throw new Error("subagentId 不能为空");
	const job = getBackgroundSubagent(id);
	if (job) {
		if (job.parentSessionId !== parentSessionId)
			throw new Error("不能读取其他主会话创建的子 Agent");
		return describeJob(job);
	}
	const run = getLiveSubagent(id);
	if (!run) throw new Error(`未找到子 Agent: ${id}`);
	if (run.parentSessionId !== parentSessionId)
		throw new Error("不能读取其他主会话创建的子 Agent");
	const output = lastAssistantText(run);
	const visible = truncateSubagentOutput(output, TRUNCATED_NOTICE);
	const active = run.status === "starting" || run.status === "running";
	return {
		subagentId: id,
		title: run.title,
		status: run.status,
		text: active
			? `${run.title} is ${run.status} (turn ${run.turnCount}).${visible.content ? `\n\nLatest assistant text:\n${visible.content}` : ""}`
			: visible.content || `${run.title} has no assistant output yet.`,
		output: output || undefined,
		truncated: visible.truncated,
	};
}

function describeJob(job: BackgroundSubagentJob): SubagentOutputView {
	const base = { subagentId: job.id, title: job.title, status: job.status };
	if (job.status === "completed" && job.result)
		return {
			...base,
			text: describeRunResult(job.result),
			output: job.result.output,
			truncated: truncateSubagentOutput(job.result.output, "").truncated,
		};
	if (job.status === "failed" || job.status === "cancelled")
		return {
			...base,
			text: `${job.title} ${job.status}${job.error ? `: ${job.error}` : ""}`,
			truncated: false,
		};
	const recent = job.toolCalls.slice(-6).map((call) => `→ ${previewToolCall(call)}`);
	return {
		...base,
		text: [
			`${job.title} is ${job.status}; no report yet. Wait for the completion follow-up or call subagent_wait.`,
			...recent,
		].join("\n"),
		truncated: false,
	};
}
