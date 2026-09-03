import type {
	AgentToolResult,
	Theme,
	ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import type { SubagentToolCall } from "../../shared/subagent/registry.js";
import {
	compactText,
	formatModelWithThinking,
	previewLines,
	resultText,
} from "../../shared/tui/tool-format.js";
import { toolCall, toolResult } from "../../shared/tui/tool-render.js";
import type { SpawnSubagentDetails, SpawnSubagentParams } from "./types.js";

const RECENT_CALLS = 6;
const PREVIEW_LINES = 12;

export function previewToolCall(call: SubagentToolCall): string {
	const args = call.arguments;
	const path = String(args.path ?? args.file_path ?? ".");
	if (call.name === "read" || call.name === "ls") return `${call.name} ${path}`;
	if (call.name === "grep")
		return `grep /${String(args.pattern ?? "")}/ in ${path}`;
	if (call.name === "find")
		return `find ${String(args.pattern ?? "*")} in ${path}`;
	if (call.name === "bash") return `bash ${compactText(String(args.command ?? ""), 60)}`;
	if (call.name === "edit" || call.name === "write") return `${call.name} ${path}`;
	return `${call.name} ${compactText(JSON.stringify(args), 60)}`;
}

function summary(details: SpawnSubagentDetails): string {
	const handle =
		details.reusable && details.subagentId
			? ` · #${details.subagentId.slice(0, 8)} · turn ${details.turn}`
			: "";
	return `${details.role} · ${formatModelWithThinking(details.model, details.thinkingLevel)}${handle}`;
}

export function renderSpawnCall(args: SpawnSubagentParams, theme: Theme) {
	const mode = args.background ? " · background" : "";
	return toolCall(
		theme,
		"spawn_subagent",
		`${args.role ?? "explore"} · ${compactText(args.description ?? "...", 40)}${mode}`,
		compactText(args.prompt ?? "...", 100),
	);
}

export function renderSpawnResult(
	result: AgentToolResult<SpawnSubagentDetails>,
	{ expanded }: ToolRenderResultOptions,
	theme: Theme,
	context: { isError: boolean },
) {
	const details = result.details as SpawnSubagentDetails | undefined;
	if (context.isError || !details) {
		const error = resultText(result.content, "spawn_subagent failed");
		return toolResult(theme, {
			status: "error",
			title: "spawn_subagent",
			summary: compactText(error, 100),
			body: expanded ? error : undefined,
			hint: error.length > 100 ? "Ctrl+O to expand error" : undefined,
		});
	}
	const calls = (expanded ? details.toolCalls : details.toolCalls.slice(-RECENT_CALLS)).map(
		(call) => `→ ${previewToolCall(call)}`,
	);
	if (details.running)
		return toolResult(theme, {
			status: "active",
			title: details.description,
			summary: summary(details),
			details: calls,
		});
	if (details.background)
		return toolResult(theme, {
			status: "success",
			title: `${details.description} · background`,
			summary: summary(details),
			details: [`id ${details.subagentId ?? "?"} · completion follow-up pending`],
		});
	const output = details.output ?? "(no output)";
	if (expanded)
		return toolResult(theme, {
			status: "success",
			title: details.description,
			summary: summary(details),
			details: calls,
			body: output,
		});
	const preview = previewLines(output, PREVIEW_LINES);
	return toolResult(theme, {
		status: "success",
		title: details.description,
		summary: summary(details),
		body: preview.text,
		hint: preview.truncated ? "(Ctrl+O to expand)" : undefined,
	});
}
