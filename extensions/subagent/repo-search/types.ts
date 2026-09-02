import type { SubagentPresentation } from "../../shared/subagent/config.js";

export interface RepoSearchDetails {
	task: string;
	model: string;
	thinkingLevel?: string;
	modelSource: "project" | "user" | "current";
	output: string;
	toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
	exitCode: number;
	stderr: string;
	truncated: boolean;
	subagentId?: string;
	reusable: boolean;
	turn?: number;
	runDir?: string;
}

export interface RepoSearchRunConfig {
	model: string;
	thinkingLevel?: string;
	source: "project" | "user" | "current";
	projectTrusted?: boolean;
	presentation?: SubagentPresentation;
}

export interface RepoSearchRunResult {
	content: string;
	details: RepoSearchDetails;
}
