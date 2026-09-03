import type { SubagentCapability } from "../shared/subagent/capability.js";
import { getLiveSubagent } from "../shared/subagent/registry.js";
import { getSubagentRole } from "../subagent/roles/loader.js";

/**
 * Subagent tools are only safe in Ask / Plan when the child cannot write:
 * spawning is gated on the role's capability, follow-ups on the live run's
 * recorded capability. Control tools that merely observe or stop children are
 * always allowed.
 */
export const SUBAGENT_OBSERVE_TOOLS = new Set([
	"subagent_wait",
	"subagent_output",
	"subagent_cancel",
]);
export const SUBAGENT_SPAWN_TOOL = "spawn_subagent";
export const SUBAGENT_FOLLOWUP_TOOL = "subagent_followup";

export interface SubagentPolicyDeps {
	roleCapability: (role: string, cwd: string, projectTrusted: boolean) => SubagentCapability;
	liveCapability: (subagentId: string) => SubagentCapability | undefined | null;
}

const defaultDeps: SubagentPolicyDeps = {
	roleCapability: (role, cwd, projectTrusted) =>
		getSubagentRole(role, { cwd, projectTrusted }).capability,
	liveCapability: (subagentId) => {
		const run = getLiveSubagent(subagentId);
		return run ? run.capability : null;
	},
};

/**
 * Returns a block reason for `spawn_subagent` / `subagent_followup` calls that
 * would reach a writable child, or `undefined` when the call is read-only.
 */
export function checkReadOnlySubagentCall(
	event: { toolName: string; input: unknown },
	cwd: string,
	projectTrusted: boolean,
	modeLabel: string,
	deps: SubagentPolicyDeps = defaultDeps,
): string | undefined {
	const input = (event.input ?? {}) as { role?: unknown; subagentId?: unknown };
	if (event.toolName === SUBAGENT_SPAWN_TOOL) {
		const role = typeof input.role === "string" && input.role.trim() ? input.role.trim() : "explore";
		let capability: SubagentCapability;
		try {
			capability = deps.roleCapability(role, cwd, projectTrusted);
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
		return capability === "read-only"
			? undefined
			: `${modeLabel} mode only allows read-only subagent roles; "${role}" is ${capability}. Press Shift+Tab to switch mode.`;
	}
	if (event.toolName === SUBAGENT_FOLLOWUP_TOOL) {
		const id = typeof input.subagentId === "string" ? input.subagentId.trim() : "";
		const capability = deps.liveCapability(id);
		if (capability === null) return undefined;
		return capability === "read-only"
			? undefined
			: `${modeLabel} mode only allows follow-ups to read-only subagents. Press Shift+Tab to switch mode.`;
	}
	return undefined;
}
