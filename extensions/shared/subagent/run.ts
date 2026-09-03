import {
	resolveSubagentTools,
	type SubagentCapability,
} from "./capability.js";
import { runJsonSubagent } from "./json-runner.js";
import type { SubagentToolCall } from "./registry.js";
import {
	runTerminalSubagent,
	type TerminalSubagentOptions,
} from "./terminal-runner.js";

export interface SubagentRunOptions
	extends Omit<TerminalSubagentOptions, "tools"> {
	capability: SubagentCapability;
	/** Parent tool snapshot; required when `capability` is `all`. */
	availableTools?: readonly string[];
	/** Extra allowlisted tools appended to the capability base set. */
	extraTools?: readonly string[];
}

export interface SubagentRunResult {
	output: string;
	model: string;
	toolCalls: SubagentToolCall[];
	/** Present for managed runs; one-shot JSON children have no handle. */
	subagentId?: string;
	reusable: boolean;
	turn: number;
	runDir?: string;
	exitCode: number;
	stderr: string;
}

/**
 * Single entry point for launching a subagent turn. Resolves the tool
 * allowlist from the capability mode, prefers the configured presentation
 * (managed RPC or Windows Terminal), and falls back to a one-shot JSON child
 * when the presentation is inline or the terminal launch was declined.
 */
export async function runSubagent(
	options: SubagentRunOptions,
): Promise<SubagentRunResult> {
	const { capability, availableTools, extraTools, ...launch } = options;
	const tools = resolveSubagentTools({
		capability,
		availableTools,
		extraTools,
	}).join(",");
	const terminal = await runTerminalSubagent({ ...launch, tools });
	if (terminal)
		return {
			...terminal,
			model: terminal.model ?? options.model,
			exitCode: 0,
			stderr: "",
		};

	const oneShot = await runJsonSubagent({
		cwd: launch.cwd,
		title: launch.title,
		model: launch.model,
		thinkingLevel: launch.thinkingLevel,
		task: launch.task,
		systemPrompt: launch.systemPrompt,
		tools,
		extensionPaths: launch.extensionPaths,
		disableContextFiles: launch.disableContextFiles,
		signal: launch.signal,
		onUpdate: ({ toolCalls }) =>
			launch.onUpdate?.({
				status: "running",
				toolCalls,
				reusable: false,
				turn: 1,
			}),
	});
	return {
		...oneShot,
		model: launch.model,
		reusable: false,
		turn: 1,
	};
}
