import {
	truncateHead,
	type AgentToolResult,
	type ExtensionAPI,
	type ExtensionContext,
	type Theme,
	type ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	getLiveSubagent,
	type LiveSubagentRun,
	type SubagentToolCall,
} from "../../shared/subagent/registry.js";
import {
	compactText,
	formatModelWithThinking,
	previewLines,
	resultText,
} from "../../shared/tui/tool-format.js";
import { toolCall, toolResult } from "../../shared/tui/tool-render.js";

const MAX_RESULT_BYTES = 50 * 1024;
const MAX_RESULT_LINES = 2000;

export interface SubagentFollowupDetails {
	running: boolean;
	status: string;
	subagentId: string;
	title: string;
	model: string;
	thinkingLevel?: string;
	turn: number;
	reusable: boolean;
	toolCalls: SubagentToolCall[];
	output?: string;
	truncated?: boolean;
}

export function resolveFollowupRun(
	subagentId: string,
	parentSessionId: string,
): LiveSubagentRun {
	const id = subagentId.trim();
	if (!id) throw new Error("subagentId 不能为空");
	const run = getLiveSubagent(id);
	if (!run) throw new Error(`未找到可复用的子 Agent: ${id}`);
	if (run.parentSessionId !== parentSessionId)
		throw new Error("不能复用其他主会话创建的子 Agent");
	if (!run.reusable) throw new Error("该子 Agent 以一次性模式启动，不能复用");
	return run;
}

function shortId(id: string): string {
	return id.slice(0, 8);
}

function previewToolCall(call: SubagentToolCall): string {
	return `→ ${call.name} ${compactText(JSON.stringify(call.arguments), 72)}`;
}

function visibleOutput(output: string): { text: string; truncated: boolean } {
	const result = truncateHead(output, {
		maxBytes: MAX_RESULT_BYTES,
		maxLines: MAX_RESULT_LINES,
	});
	return {
		text: result.truncated
			? `${result.content}\n\n[Subagent follow-up 输出已截断；完整输出保存在工具 details 中。]`
			: result.content,
		truncated: result.truncated,
	};
}

export function registerSubagentFollowupTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "subagent_followup",
		label: "Subagent Follow-up",
		description:
			"Continue, correct, or extend the same investigation or implementation thread in an existing reusable subagent by exact subagentId. The child keeps its prior context, cwd, model, system prompt, and tool permissions. Requests to one child are serialized. Start a new reviewer for an independent review; an agent must not review its own work.",
		promptSnippet:
			"Continue, correct, or extend directly related work in a reusable subagent; use a new agent for independent review",
		promptGuidelines: [
			"Use subagent_followup only when a previous tool result returned a reusable subagentId and the task supplements evidence, corrects a conclusion, continues implementation, or handles feedback in that same thread.",
			"Start a new reviewer for an independent review or verification; do not ask the agent that produced an implementation or conclusion to review its own work.",
			"Pass subagent_followup the exact subagentId; do not guess IDs or use an old child for an unrelated topic, changed permissions, changed model, or a fresh domain snapshot.",
		],
		parameters: Type.Object({
			subagentId: Type.String({
				minLength: 1,
				description: "Exact reusable subagentId returned by an earlier tool result",
			}),
			task: Type.String({
				minLength: 1,
				description: "Directly related follow-up task for that child",
			}),
		}),

		async execute(
			_toolCallId: string,
			params: { subagentId: string; task: string },
			signal: AbortSignal | undefined,
			onUpdate:
				| ((partial: {
						content: Array<{ type: "text"; text: string }>;
						details: SubagentFollowupDetails;
				  }) => void)
				| undefined,
			ctx: ExtensionContext,
		) {
			const run = resolveFollowupRun(
				params.subagentId,
				ctx.sessionManager.getSessionId(),
			);
			const task = params.task.trim();
			if (!task) throw new Error("follow-up task 不能为空");
			const result = await run.request(task, {
				signal,
				onUpdate: (update) => {
					const recent = update.toolCalls.slice(-6).map(previewToolCall);
					onUpdate?.({
						content: [
							{
								type: "text",
								text: [
									`Subagent ${shortId(run.id)} turn ${update.turn}: ${update.status}`,
									...recent,
								].join("\n"),
							},
						],
						details: {
							running: true,
							status: update.status,
							subagentId: run.id,
							title: run.title,
							model: run.model,
							thinkingLevel: run.thinkingLevel,
							turn: update.turn,
							reusable: update.reusable,
							toolCalls: update.toolCalls,
						},
					});
				},
			});
			const visible = visibleOutput(result.output);
			return {
				content: [
					{
						type: "text" as const,
						text: `${visible.text}\n\nReusable subagentId: ${result.subagentId} (turn ${result.turn}).`,
					},
				],
				details: {
					running: false,
					status: "completed",
					subagentId: result.subagentId,
					title: run.title,
					model: result.model ?? run.model,
					thinkingLevel: run.thinkingLevel,
					turn: result.turn,
					reusable: result.reusable,
					toolCalls: result.toolCalls,
					output: result.output,
					truncated: visible.truncated,
				},
			};
		},

		renderCall(args: { subagentId?: string; task?: string }, theme: Theme) {
			return toolCall(
				theme,
				"subagent_followup",
				args.subagentId ? shortId(args.subagentId) : "...",
				compactText(args.task ?? "...", 100),
			);
		},

		renderResult(
			result: AgentToolResult<SubagentFollowupDetails>,
			{ expanded }: ToolRenderResultOptions,
			theme: Theme,
			context: { isError: boolean },
		) {
			const details = result.details as SubagentFollowupDetails | undefined;
			if (context.isError || !details) {
				const error = resultText(result.content, "Subagent follow-up failed");
				return toolResult(theme, {
					status: "error",
					title: "subagent_followup",
					summary: compactText(error, 100),
					body: expanded ? error : undefined,
				});
			}
			const summary = `${shortId(details.subagentId)} · turn ${details.turn} · ${formatModelWithThinking(details.model, details.thinkingLevel)}`;
			if (details.running)
				return toolResult(theme, {
					status: "active",
					title: `subagent_followup · ${details.status}`,
					summary,
					details: details.toolCalls
						.slice(expanded ? 0 : -6)
						.map(previewToolCall),
				});
			const output = details.output ?? "(no output)";
			const preview = previewLines(output, 12);
			return toolResult(theme, {
				status: "success",
				title: "subagent_followup",
				summary,
				details: expanded ? details.toolCalls.map(previewToolCall) : undefined,
				body: expanded ? output : preview.text,
				hint:
					!expanded && (preview.truncated || details.truncated)
						? "Ctrl+O to expand full turn"
						: undefined,
			});
		},
	});
}
