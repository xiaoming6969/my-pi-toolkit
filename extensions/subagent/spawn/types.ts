import type { SubagentToolCall } from "../../shared/subagent/registry.js";
import type { SubagentOutputFile } from "../../shared/subagent/run.js";

export interface SpawnSubagentParams {
	prompt: string;
	description: string;
	role?: string;
	cwd?: string;
	background?: boolean;
	relevantFiles?: string[];
	constraints?: string[];
	expectedOutput?: string;
	/** Fork a settled subagent's transcript into this child. */
	resumeFrom?: string;
}

export type SpawnOutputFile = SubagentOutputFile;

export interface SpawnSubagentDetails {
	running: boolean;
	/** True when the tool returned immediately after starting a background job. */
	background?: boolean;
	role: string;
	description: string;
	model: string;
	thinkingLevel?: string;
	toolCalls: SubagentToolCall[];
	output?: string;
	truncated?: boolean;
	subagentId?: string;
	reusable: boolean;
	turn: number;
	runDir?: string;
	/** Full report written to disk when the child finishes. */
	reportFile?: string;
	outputs?: SpawnOutputFile[];
	resumedFrom?: string;
}
