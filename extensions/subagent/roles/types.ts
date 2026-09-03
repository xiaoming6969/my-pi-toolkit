import type { SubagentCapability } from "../../shared/subagent/capability.js";

export type SubagentRoleSource = "builtin" | "user" | "project";

/**
 * `lean` children start with `--no-extensions` and only the extensions the
 * role needs; `inherit` children load the parent's normal resources so they
 * can use the same tools, skills and prompt templates as the main agent.
 */
export type SubagentRoleResources = "lean" | "inherit";

/** A file the role is expected to produce under the run's `outputs/` directory. */
export interface SubagentRoleOutput {
	name: string;
	description: string;
	required: boolean;
}

export interface SubagentRoleDefinition {
	name: string;
	description: string;
	capability: SubagentCapability;
	systemPrompt: string;
	resources: SubagentRoleResources;
	/** Role-level model routing; falls back to the caller's model when unset. */
	model?: string;
	thinkingLevel?: string;
	/** Extra allowlisted tools appended to the capability base set. */
	extraTools: string[];
	/** Load the `.gitignore` guard and optional pi-lens read-only tools. */
	repoSearchGuard: boolean;
	/** Whether the child reads AGENTS.md / context files (`--no-context-files` when false). */
	contextFiles: boolean;
	/** Declared output files; the parent receives their paths after the run. */
	outputs: SubagentRoleOutput[];
	source: SubagentRoleSource;
}
