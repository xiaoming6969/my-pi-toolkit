import type { SubagentToolCall } from "../../shared/subagent/registry.js";

export interface SpawnSubagentParams {
	prompt: string;
	description: string;
	role?: string;
	cwd?: string;
	background?: boolean;
}

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
}
