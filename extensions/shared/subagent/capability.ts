/**
 * Capability modes map a subagent role to a concrete `--tools` allowlist.
 * Callers describe intent (read-only, execute, ...) instead of hand-writing
 * tool strings; the child still receives an exact allowlist.
 */
export type SubagentCapability = "read-only" | "read-write" | "execute" | "all";

const READ_TOOLS = ["read", "grep", "find", "ls"] as const;
const WRITE_TOOLS = ["edit", "write"] as const;
const EXECUTE_TOOLS = ["bash"] as const;

/**
 * Tools that spawn or steer subagents from the parent. A child never inherits
 * them, which keeps the agent tree at depth one.
 */
const PARENT_CONTROL_TOOLS = new Set([
	"repo_search",
	"spawn_subagent",
	"subagent_followup",
	"subagent_wait",
	"subagent_output",
	"subagent_cancel",
	"multi_task",
	"tapd_review",
]);

export interface SubagentToolsOptions {
	capability: SubagentCapability;
	/**
	 * Parent tool snapshot used by `all`. Required for `all`; ignored by the
	 * fixed capability modes.
	 */
	availableTools?: readonly string[];
	/** Additional allowlisted tools appended after the capability base set. */
	extraTools?: readonly string[];
}

function baseTools(options: SubagentToolsOptions): readonly string[] {
	switch (options.capability) {
		case "read-only":
			return READ_TOOLS;
		case "read-write":
			return [...READ_TOOLS, ...WRITE_TOOLS];
		case "execute":
			return [...READ_TOOLS, ...EXECUTE_TOOLS];
		case "all":
			if (!options.availableTools)
				throw new Error("capability all 需要提供父 Agent 的工具快照");
			return options.availableTools;
	}
}

export function resolveSubagentTools(options: SubagentToolsOptions): string[] {
	const tools: string[] = [];
	for (const name of [...baseTools(options), ...(options.extraTools ?? [])]) {
		if (PARENT_CONTROL_TOOLS.has(name) || tools.includes(name)) continue;
		tools.push(name);
	}
	return tools;
}
