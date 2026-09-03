import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { loadSubagentUiConfig } from "../../shared/subagent/config.js";
import type { SubagentTurnUpdate } from "../../shared/subagent/registry.js";
import type { SubagentRunResult } from "../../shared/subagent/run.js";
import { subagentRunDir } from "../../shared/subagent/run-paths.js";
import { acquireSubagentSlot } from "../../shared/subagent/slot-semaphore.js";
import { thinkingLevelForModel } from "../../shared/subagent/thinking-level.js";
import { runRoleSubagent } from "../roles/launch.js";
import { getSubagentRole } from "../roles/loader.js";
import type { SubagentRoleOutput } from "../roles/types.js";
import { buildSubagentBrief, collectDeclaredOutputs } from "./brief.js";
import { resolveSpawnCwd, resolveSpawnTarget } from "./resolve.js";
import { resolveResumeSource } from "./resume.js";
import type { SpawnOutputFile, SpawnSubagentParams } from "./types.js";

export interface PreparedSpawn {
	/** Pre-assigned subagent id, identical for foreground and background runs. */
	id: string;
	role: string;
	description: string;
	title: string;
	model: string;
	thinkingLevel?: string;
	resumedFrom?: string;
	/**
	 * Take a launch slot, run one turn, release the slot. The result carries
	 * `artifacts` (full report file and declared outputs) on success.
	 */
	launch(
		signal: AbortSignal | undefined,
		onUpdate: (update: SubagentTurnUpdate) => void,
	): Promise<SubagentRunResult>;
}

function outputsDirFor(runDir: string, outputs: SubagentRoleOutput[]): string | undefined {
	if (outputs.length === 0) return undefined;
	const dir = join(runDir, "outputs");
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	return dir;
}

/**
 * Validate parameters and resolve role, cwd, model, thinking level and the
 * resume source before anything is spawned, so both foreground and background
 * paths fail early with the same errors.
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
	const parentSessionId = ctx.sessionManager.getSessionId();
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
	const resume = params.resumeFrom
		? resolveResumeSource(params.resumeFrom, parentSessionId)
		: undefined;
	const id = randomUUID();
	const runDir = subagentRunDir(id);
	mkdirSync(runDir, { recursive: true, mode: 0o700 });
	const outputsDir = outputsDirFor(runDir, role.outputs);
	const task = buildSubagentBrief({
		prompt,
		relevantFiles: params.relevantFiles,
		constraints: params.constraints,
		expectedOutput: params.expectedOutput,
		outputs: role.outputs,
		outputsDir,
		resumedFrom: resume?.subagentId,
	});
	const title = `${role.name} · ${description}`;
	const parentTools = pi.getActiveTools();
	const keepOpen = loadSubagentUiConfig().keepOpen;
	return {
		id,
		role: role.name,
		description,
		title,
		model: target.model,
		thinkingLevel,
		resumedFrom: resume?.subagentId,
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
				const result = await runRoleSubagent({
					role,
					cwd,
					title,
					task,
					model: target.model,
					thinkingLevel,
					projectTrusted,
					parentTools,
					presentation: target.presentation,
					keepOpen,
					parentSessionId,
					runId: id,
					forkSessionFile: resume?.sessionFile,
					signal,
					onUpdate,
				});
				const reportFile = join(runDir, "report.md");
				writeFileSync(reportFile, result.output, { encoding: "utf8", mode: 0o600 });
				const outputs: SpawnOutputFile[] = outputsDir
					? collectDeclaredOutputs(role.outputs, outputsDir)
					: [];
				return { ...result, artifacts: { reportFile, outputs } };
			} finally {
				release();
			}
		},
	};
}
