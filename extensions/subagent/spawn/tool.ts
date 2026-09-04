import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	startBackgroundSubagent,
	type BackgroundSubagentJob,
} from "../../shared/subagent/background.js";
import { assertNotSubagentChild } from "../../shared/subagent/child-guard.js";
import { truncateSubagentOutput } from "../../shared/subagent/output-limit.js";
import type { SubagentToolCall } from "../../shared/subagent/registry.js";
import { BUILTIN_SUBAGENT_ROLES } from "../roles/builtin.js";
import { previewToolCall, renderSpawnCall, renderSpawnResult } from "./render.js";
import { describeRunResult } from "./result-text.js";
import type { PreparedSpawn } from "./prepare.js";
import type { SpawnSubagentDetails, SpawnSubagentParams } from "./types.js";

const ROLE_SUMMARY = BUILTIN_SUBAGENT_ROLES.map(
	(role) => `${role.name}: ${role.description}`,
).join(" ");

type SpawnUpdate = (partial: {
	content: Array<{ type: "text"; text: string }>;
	details: SpawnSubagentDetails;
}) => void;

function runningText(
	description: string,
	toolCalls: SubagentToolCall[],
): string {
	const recent = toolCalls.slice(-6).map((call) => `→ ${previewToolCall(call)}`);
	return [`子 Agent 运行中：${description}`, ...recent].join("\n");
}

function baseDetails(prepared: PreparedSpawn) {
	return {
		role: prepared.role,
		description: prepared.description,
		model: prepared.model,
		thinkingLevel: prepared.thinkingLevel,
		startedAt: new Date().toISOString(),
	};
}

function completionNotice(job: BackgroundSubagentJob): string {
	const outcome =
		job.status === "completed"
			? "finished successfully"
			: job.status === "cancelled"
				? "was cancelled"
				: `failed: ${job.error ?? "unknown error"}`;
	return `Background subagent ${job.id} (${job.title}) ${outcome}. Do not poll background subagents; call subagent_output with this id to read the report, then continue the main task.`;
}

async function runForeground(
	prepared: PreparedSpawn,
	signal: AbortSignal | undefined,
	onUpdate: SpawnUpdate | undefined,
) {
	const base = baseDetails(prepared);
	const result = await prepared.launch(signal, (update) =>
		onUpdate?.({
			content: [
				{
					type: "text",
					text: runningText(prepared.description, update.toolCalls),
				},
			],
			details: {
				...base,
				running: true,
				toolCalls: update.toolCalls,
				subagentId: update.subagentId,
				reusable: update.reusable,
				turn: update.turn,
			},
		}),
	);
	return {
		content: [{ type: "text" as const, text: describeRunResult(result) }],
		details: {
			...base,
			running: false,
			toolCalls: result.toolCalls,
			output: result.output,
			truncated: truncateSubagentOutput(result.output, "").truncated,
			subagentId: result.subagentId,
			reusable: result.reusable,
			turn: result.turn,
			runDir: result.runDir,
			reportFile: result.artifacts?.reportFile,
			outputs: result.artifacts?.outputs,
			resumedFrom: prepared.resumedFrom,
			worktree: prepared.worktree,
		} satisfies SpawnSubagentDetails,
	};
}

function startBackground(
	prepared: PreparedSpawn,
	ctx: ExtensionContext,
	pi: ExtensionAPI,
) {
	const job = startBackgroundSubagent({
		id: prepared.id,
		title: prepared.title,
		parentSessionId: ctx.sessionManager.getSessionId(),
		run: (signal, onToolCalls) =>
			prepared.launch(signal, (update) => onToolCalls(update.toolCalls)),
		onSettled: (settled) =>
			pi.sendMessage(
				{
					customType: "subagent-complete",
					content: completionNotice(settled),
					display: true,
					details: { subagentId: settled.id, status: settled.status },
				},
				{ deliverAs: "followUp", triggerTurn: true },
			),
	});
	const worktree = prepared.worktree
		? ` It works in worktree ${prepared.worktree.path} (branch ${prepared.worktree.branch}).`
		: "";
	return {
		content: [
			{
				type: "text" as const,
				text: `Background subagent started: ${job.id} (${job.title}).${worktree} Continue with independent work; a completion follow-up will arrive. Use subagent_wait to block on it, subagent_output to read progress or the report, and subagent_cancel to stop it.`,
			},
		],
		details: {
			...baseDetails(prepared),
			running: false,
			background: true,
			toolCalls: [],
			subagentId: job.id,
			reusable: false,
			turn: 0,
			resumedFrom: prepared.resumedFrom,
			worktree: prepared.worktree,
		} satisfies SpawnSubagentDetails,
	};
}

export function registerSpawnSubagentTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "spawn_subagent",
		label: "Spawn Subagent",
		description: `Delegate one self-contained task to an isolated subagent with its own context window and a role-defined tool allowlist. Built-in roles — ${ROLE_SUMMARY} Projects and users can define additional roles. Give the child a structured brief (relevantFiles, constraints, expectedOutput). Set background=true to get a subagentId immediately and keep working; a completion follow-up is delivered automatically. Use resumeFrom to fork a settled subagent's transcript into a new role (e.g. explore → implement). Reusable children return a subagentId for subagent_followup.`,
		promptSnippet:
			"Delegate a self-contained research, planning, implementation or review task to a role-defined subagent, optionally in the background",
		promptGuidelines: [
			"Use spawn_subagent when a task is self-contained, benefits from a separate context window, and can be described completely in the prompt; pass relevantFiles, constraints and expectedOutput instead of burying them in prose.",
			"Use resumeFrom to hand a finished research or plan transcript to an implement or review child instead of re-explaining the findings; the source must belong to this session and have stopped running.",
			"Pick the least-privileged role that can finish the task: explore or plan for read-only work, review for independent verification, implement only when files must change.",
			"Prefer isolation=worktree for implement children whose edits you want to review before they touch the working tree; the result tells you how to diff, merge or discard the worktree.",
			"Use background=true only when you have other independent work to do meanwhile; then do not poll, wait for the completion follow-up or call subagent_wait once.",
			"Never ask the agent that produced a change or conclusion to review its own work; spawn a separate review subagent instead.",
			"Do not use spawn_subagent for tasks the parent can finish with one or two direct tool calls, or for work that needs back-and-forth with the user.",
		],
		parameters: Type.Object({
			prompt: Type.String({
				minLength: 1,
				description:
					"Complete task prompt for the child, including context, relevant paths and the expected report format",
			}),
			description: Type.String({
				minLength: 1,
				description: "Short label for the task (3-8 words), shown in the UI",
			}),
			role: Type.Optional(
				Type.String({
					description:
						"Role name; defaults to explore. Built-ins: explore, plan, implement, review",
				}),
			),
			cwd: Type.Optional(
				Type.String({
					description: "Working directory for the child; defaults to the parent's cwd",
				}),
			),
			background: Type.Optional(
				Type.Boolean({
					description:
						"Return immediately with a subagentId and run in the background; defaults to false",
				}),
			),
			relevantFiles: Type.Optional(
				Type.Array(Type.String({ minLength: 1 }), {
					maxItems: 50,
					description: "Files or directories the child should start from",
				}),
			),
			constraints: Type.Optional(
				Type.Array(Type.String({ minLength: 1 }), {
					maxItems: 20,
					description: "Hard constraints the child must respect",
				}),
			),
			expectedOutput: Type.Optional(
				Type.String({
					description: "Shape of the report you want back (sections, format, level of detail)",
				}),
			),
			resumeFrom: Type.Optional(
				Type.String({
					minLength: 1,
					description:
						"subagentId of a settled subagent from this session; the child forks its transcript and continues with the new role and prompt",
				}),
			),
			isolation: Type.Optional(
				Type.Unsafe<"none" | "worktree">({
					type: "string",
					enum: ["none", "worktree"],
					description:
						"worktree runs the child in its own git worktree (branch subagent/<id>) so its edits never touch the parent's working tree; mutually exclusive with cwd. Default none.",
				}),
			),
		}),

		async execute(
			_toolCallId: string,
			params: SpawnSubagentParams,
			signal: AbortSignal | undefined,
			onUpdate: SpawnUpdate | undefined,
			ctx: ExtensionContext,
		) {
			assertNotSubagentChild("派生子 Agent");
			const { prepareSpawn } = await import("./prepare.js");
			const prepared = await prepareSpawn(params, ctx, pi);
			if (params.background) return startBackground(prepared, ctx, pi);
			return runForeground(prepared, signal, onUpdate);
		},

		renderCall: renderSpawnCall,
		renderResult: renderSpawnResult,
	});
}
