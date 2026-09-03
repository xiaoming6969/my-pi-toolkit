import { randomUUID } from "node:crypto";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { loadSubagentUiConfig } from "../../shared/subagent/config.js";
import type { SubagentTurnUpdate } from "../../shared/subagent/registry.js";
import type { SubagentRunResult } from "../../shared/subagent/run.js";
import { acquireSubagentSlot } from "../../shared/subagent/slot-semaphore.js";
import { thinkingLevelForModel } from "../../shared/subagent/thinking-level.js";
import { runRoleSubagent } from "../roles/launch.js";
import { getSubagentRole } from "../roles/loader.js";
import { resolveSpawnCwd, resolveSpawnTarget } from "./resolve.js";
import type { SpawnSubagentParams } from "./types.js";

export interface PreparedSpawn {
	/** Pre-assigned subagent id, identical for foreground and background runs. */
	id: string;
	role: string;
	description: string;
	title: string;
	model: string;
	thinkingLevel?: string;
	/** Take a launch slot, run one turn, release the slot. */
	launch(
		signal: AbortSignal | undefined,
		onUpdate: (update: SubagentTurnUpdate) => void,
	): Promise<SubagentRunResult>;
}

/**
 * Validate parameters and resolve role, cwd, model and thinking level before
 * anything is spawned, so both foreground and background paths fail early with
 * the same errors.
 */
export function prepareSpawn(
	params: SpawnSubagentParams,
	ctx: ExtensionContext,
	pi: ExtensionAPI,
): PreparedSpawn {
	const prompt = params.prompt.trim();
	const description = params.description.trim();
	if (!prompt) throw new Error("prompt 不能为空");
	if (!description) throw new Error("description 不能为空");
	const projectTrusted = ctx.isProjectTrusted();
	const cwd = resolveSpawnCwd(ctx.cwd, params.cwd);
	const role = getSubagentRole(params.role ?? "explore", { cwd, projectTrusted });
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
	const id = randomUUID();
	const title = `${role.name} · ${description}`;
	const parentSessionId = ctx.sessionManager.getSessionId();
	const parentTools = pi.getActiveTools();
	const keepOpen = loadSubagentUiConfig().keepOpen;
	return {
		id,
		role: role.name,
		description,
		title,
		model: target.model,
		thinkingLevel,
		async launch(signal, onUpdate) {
			const release = await acquireSubagentSlot(signal ?? new AbortController().signal);
			try {
				onUpdate({
					status: "starting",
					toolCalls: [],
					subagentId: id,
					reusable: false,
					turn: 1,
				});
				return await runRoleSubagent({
					role,
					cwd,
					title,
					task: prompt,
					model: target.model,
					thinkingLevel,
					projectTrusted,
					parentTools,
					presentation: target.presentation,
					keepOpen,
					parentSessionId,
					runId: id,
					signal,
					onUpdate,
				});
			} finally {
				release();
			}
		},
	};
}
