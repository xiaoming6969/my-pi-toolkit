import type { SubagentToolCall } from "../../shared/subagent/registry.js";

export interface SpawnSubagentParams {
	prompt: string;
	description: string;
	role?: string;
	cwd?: string;
}

export interface SpawnSubagentDetails {
	running: boolean;
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
