import type {
	AgentToolResult,
	ExtensionAPI,
	ExtensionContext,
	Theme,
	ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	cancelBackgroundSubagent,
	getBackgroundSubagent,
	waitForBackgroundSubagents,
	type WaitMode,
} from "../../shared/subagent/background.js";
import { assertNotSubagentChild } from "../../shared/subagent/child-guard.js";
import { getLiveSubagent } from "../../shared/subagent/registry.js";
import { compactText, previewLines, resultText } from "../../shared/tui/tool-format.js";
import { toolCall, toolResult } from "../../shared/tui/tool-render.js";
import {
	describeSubagentOutput,
	jobStatusLine,
	jobStatusView,
	type SubagentOutputView,
	type SubagentStatusView,
} from "./control-format.js";

const MAX_WAIT_IDS = 20;
const DEFAULT_WAIT_MS = 30_000;
const MAX_WAIT_MS = 10 * 60_000;

function shortId(id: string): string {
	return id.slice(0, 8);
}

function renderSimpleResult(title: string) {
	return (
		result: AgentToolResult<unknown>,
		{ expanded }: ToolRenderResultOptions,
		theme: Theme,
		context: { isError: boolean },
	) => {
		const text = resultText(result.content, "(no output)");
		const preview = previewLines(text, 12);
		return toolResult(theme, {
			status: context.isError ? "error" : "success",
			title,
			summary: compactText(text.split("\n")[0] ?? "", 80),
			body: expanded ? text : preview.text,
			hint: !expanded && preview.truncated ? "(Ctrl+O to expand)" : undefined,
		});
	};
}

function registerWait(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "subagent_wait",
		label: "Wait for Subagents",
		description:
			"Block until background subagents settle. mode wait_all (default) waits for every id, wait_any returns when the first settles. Returns each subagent's status; read reports with subagent_output. Prefer the automatic completion follow-up; use this only when the next step truly depends on the result.",
		promptSnippet: "Wait for background subagents to finish",
		promptGuidelines: [
			"Call subagent_wait once when you have nothing else to do until background subagents finish; do not call it in a loop.",
		],
		parameters: Type.Object({
			subagentIds: Type.Array(Type.String({ minLength: 1 }), {
				minItems: 1,
				maxItems: MAX_WAIT_IDS,
			}),
			mode: Type.Optional(
				Type.Unsafe<WaitMode>({
					type: "string",
					enum: ["wait_any", "wait_all"],
					description: "wait_all (default) or wait_any",
				}),
			),
			timeoutMs: Type.Optional(
				Type.Integer({ minimum: 1000, maximum: MAX_WAIT_MS, description: "Default 30000" }),
			),
		}),
		async execute(
			_id: string,
			params: { subagentIds: string[]; mode?: WaitMode; timeoutMs?: number },
			signal: AbortSignal | undefined,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			assertNotSubagentChild("等待子 Agent");
			const sessionId = ctx.sessionManager.getSessionId();
			for (const id of params.subagentIds) {
				const job = getBackgroundSubagent(id.trim());
				if (job && job.parentSessionId !== sessionId)
					throw new Error("不能等待其他主会话创建的子 Agent");
			}
			const { jobs, timedOut } = await waitForBackgroundSubagents({
				ids: params.subagentIds.map((id) => id.trim()),
				mode: params.mode ?? "wait_all",
				timeoutMs: params.timeoutMs ?? DEFAULT_WAIT_MS,
				signal,
			});
			const header = timedOut
				? `Timed out after ${params.timeoutMs ?? DEFAULT_WAIT_MS} ms; current statuses:`
				: "Subagent statuses:";
			return {
				content: [
					{
						type: "text" as const,
						text: [header, ...jobs.map(jobStatusLine)].join("\n"),
					},
				],
				details: { timedOut, jobs: jobs.map(jobStatusView) } satisfies {
					timedOut: boolean;
					jobs: SubagentStatusView[];
				},
			};
		},
		renderCall(args: { subagentIds?: string[]; mode?: string }, theme: Theme) {
			const ids = (args.subagentIds ?? []).map(shortId).join(", ");
			return toolCall(theme, "subagent_wait", args.mode ?? "wait_all", ids);
		},
		renderResult: renderSimpleResult("subagent_wait"),
	});
}

function registerOutput(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "subagent_output",
		label: "Subagent Output",
		description:
			"Read the report of a settled background subagent, or the current progress and latest assistant text of a running or reusable subagent, by exact subagentId.",
		promptSnippet: "Read a background subagent's report or progress",
		promptGuidelines: [
			"Call subagent_output after a subagent completion follow-up or subagent_wait to read the report; do not poll a running subagent with it.",
		],
		parameters: Type.Object({
			subagentId: Type.String({ minLength: 1 }),
		}),
		async execute(
			_id: string,
			params: { subagentId: string },
			_signal: AbortSignal | undefined,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			assertNotSubagentChild("读取子 Agent 输出");
			const view = describeSubagentOutput(
				params.subagentId,
				ctx.sessionManager.getSessionId(),
			);
			return {
				content: [{ type: "text" as const, text: view.text }],
				details: view satisfies SubagentOutputView,
			};
		},
		renderCall(args: { subagentId?: string }, theme: Theme) {
			return toolCall(theme, "subagent_output", args.subagentId ? shortId(args.subagentId) : "...");
		},
		renderResult: renderSimpleResult("subagent_output"),
	});
}

function registerCancel(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "subagent_cancel",
		label: "Cancel Subagent",
		description:
			"Cancel a queued or running background subagent, or terminate a live reusable subagent, by exact subagentId. Reports success if it had already settled.",
		promptSnippet: "Cancel or terminate a subagent",
		promptGuidelines: [
			"Use subagent_cancel when a background subagent's result is no longer needed or the user asks to stop it.",
		],
		parameters: Type.Object({
			subagentId: Type.String({ minLength: 1 }),
		}),
		async execute(
			_id: string,
			params: { subagentId: string },
			_signal: AbortSignal | undefined,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			assertNotSubagentChild("取消子 Agent");
			const id = params.subagentId.trim();
			const sessionId = ctx.sessionManager.getSessionId();
			const job = getBackgroundSubagent(id);
			const run = getLiveSubagent(id);
			if (!job && !run) throw new Error(`未找到子 Agent: ${id}`);
			if ((job && job.parentSessionId !== sessionId) || (run && run.parentSessionId !== sessionId))
				throw new Error("不能取消其他主会话创建的子 Agent");
			const cancelledJob = job ? cancelBackgroundSubagent(id) : false;
			if (run) run.dispose();
			const text = cancelledJob || run
				? `Subagent ${id} cancelled.`
				: `Subagent ${id} had already ${job?.status ?? "settled"}.`;
			return {
				content: [{ type: "text" as const, text }],
				details: { subagentId: id, cancelled: cancelledJob || Boolean(run) },
			};
		},
		renderCall(args: { subagentId?: string }, theme: Theme) {
			return toolCall(theme, "subagent_cancel", args.subagentId ? shortId(args.subagentId) : "...");
		},
		renderResult: renderSimpleResult("subagent_cancel"),
	});
}

export function registerSubagentControlTools(pi: ExtensionAPI): void {
	registerWait(pi);
	registerOutput(pi);
	registerCancel(pi);
}
