import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { assertNotSubagentChild } from "../../shared/subagent/child-guard.js";
import { loadSubagentUiConfig } from "../../shared/subagent/config.js";
import { truncateSubagentOutput } from "../../shared/subagent/output-limit.js";
import type { SubagentToolCall } from "../../shared/subagent/registry.js";
import { thinkingLevelForModel } from "../../shared/subagent/thinking-level.js";
import { BUILTIN_SUBAGENT_ROLES } from "../roles/builtin.js";
import { runRoleSubagent } from "../roles/launch.js";
import { getSubagentRole } from "../roles/loader.js";
import { previewToolCall, renderSpawnCall, renderSpawnResult } from "./render.js";
import { resolveSpawnCwd, resolveSpawnTarget } from "./resolve.js";
import type { SpawnSubagentDetails, SpawnSubagentParams } from "./types.js";

const TRUNCATED_NOTICE =
	"[子 Agent 输出已截断；完整输出保存在工具 details 中。]";

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

export function registerSpawnSubagentTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "spawn_subagent",
		label: "Spawn Subagent",
		description: `Delegate one self-contained task to an isolated subagent with its own context window and a role-defined tool allowlist. Built-in roles — ${ROLE_SUMMARY} Projects and users can define additional roles. The child reports a summary back; reusable children return a subagentId for subagent_followup.`,
		promptSnippet:
			"Delegate a self-contained research, planning, implementation or review task to a role-defined subagent",
		promptGuidelines: [
			"Use spawn_subagent when a task is self-contained, benefits from a separate context window, and can be described completely in the prompt; include relevant file paths and the expected output format.",
			"Pick the least-privileged role that can finish the task: explore or plan for read-only work, review for independent verification, implement only when files must change.",
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
		}),

		async execute(
			_toolCallId: string,
			params: SpawnSubagentParams,
			signal: AbortSignal | undefined,
			onUpdate: SpawnUpdate | undefined,
			ctx: ExtensionContext,
		) {
			assertNotSubagentChild("派生子 Agent");
			const prompt = params.prompt.trim();
			const description = params.description.trim();
			if (!prompt) throw new Error("prompt 不能为空");
			if (!description) throw new Error("description 不能为空");
			const projectTrusted = ctx.isProjectTrusted();
			const cwd = resolveSpawnCwd(ctx.cwd, params.cwd);
			const role = getSubagentRole(params.role ?? "explore", {
				cwd,
				projectTrusted,
			});
			const target = resolveSpawnTarget({
				role,
				cwd,
				projectTrusted,
				currentModel: ctx.model,
			});
			const thinkingLevel = thinkingLevelForModel(
				target.model,
				role.thinkingLevel ?? ctx.thinkingLevel,
				ctx.modelRegistry,
			);
			const base = {
				role: role.name,
				description,
				model: target.model,
				thinkingLevel,
			};
			const result = await runRoleSubagent({
				role,
				cwd,
				title: `${role.name} · ${description}`,
				task: prompt,
				model: target.model,
				thinkingLevel,
				projectTrusted,
				parentTools: pi.getActiveTools(),
				presentation: target.presentation,
				keepOpen: loadSubagentUiConfig().keepOpen,
				parentSessionId: ctx.sessionManager.getSessionId(),
				signal,
				onUpdate: (update) =>
					onUpdate?.({
						content: [
							{ type: "text", text: runningText(description, update.toolCalls) },
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
			});
			const visible = truncateSubagentOutput(result.output, TRUNCATED_NOTICE);
			const handle =
				result.reusable && result.subagentId
					? `\n\nReusable subagentId: ${result.subagentId} (turn ${result.turn}).`
					: "";
			return {
				content: [{ type: "text" as const, text: `${visible.content}${handle}` }],
				details: {
					...base,
					running: false,
					toolCalls: result.toolCalls,
					output: result.output,
					truncated: visible.truncated,
					subagentId: result.subagentId,
					reusable: result.reusable,
					turn: result.turn,
					runDir: result.runDir,
				} satisfies SpawnSubagentDetails,
			};
		},

		renderCall: renderSpawnCall,
		renderResult: renderSpawnResult,
	});
}
