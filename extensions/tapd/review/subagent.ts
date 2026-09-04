import { truncateSubagentOutput } from "../../shared/subagent/output-limit.js";
import { runSubagent } from "../../shared/subagent/run.js";
import { resolveTapdLeanExtensionPaths } from "../lean-extensions.js";
import { REVIEW_SYSTEM_PROMPT } from "./prompt.js";
import type { ReviewSubagentResult } from "./types.js";

const TRUNCATED_NOTICE = "> 报告超过 50KB，已截断后续内容。";

export async function runReviewSubagent(options: {
	cwd: string;
	model: string;
	thinkingLevel?: string;
	task: string;
	projectTrusted: boolean;
	parentSessionId?: string;
	artifactFiles?: string[];
	signal?: AbortSignal;
	onToolCall?: (name: string, args: Record<string, unknown>) => void;
}): Promise<ReviewSubagentResult> {
	let reportedCalls = 0;
	const result = await runSubagent({
		cwd: options.cwd,
		title: "TAPD Review Subagent",
		model: options.model,
		thinkingLevel: options.thinkingLevel,
		task: options.task,
		systemPrompt: REVIEW_SYSTEM_PROMPT,
		capability: "read-only",
		extensionPaths: await resolveTapdLeanExtensionPaths(
			options.cwd,
			options.projectTrusted,
			options.model,
		),
		artifactFiles: options.artifactFiles,
		// TAPD Review must use the persistent RPC path so the shared subagent
		// registry, footer count, overlay, and /subagents all observe the run.
		presentation: "manual",
		parentSessionId: options.parentSessionId,
		signal: options.signal,
		onUpdate: ({ toolCalls }) => {
			for (const call of toolCalls.slice(reportedCalls))
				options.onToolCall?.(call.name, call.arguments);
			reportedCalls = toolCalls.length;
		},
	});
	return {
		report: truncateSubagentOutput(result.output, TRUNCATED_NOTICE).content,
		model: result.model,
		thinkingLevel: options.thinkingLevel,
		toolCalls: result.toolCalls,
		subagentId: result.subagentId,
		reusable: result.reusable,
		turn: result.turn,
	};
}
