import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { SubagentPresentation } from "../../shared/subagent/config.js";
import { resolveRepoSearchConfig } from "../repo-search/config.js";
import type { SubagentRoleDefinition } from "../roles/types.js";

export interface SpawnTarget {
	model: string;
	/** Where the model came from, shown in the tool card summary. */
	modelSource: "role" | "project" | "user" | "current";
	presentation?: SubagentPresentation;
}

export function resolveSpawnCwd(baseCwd: string, requested?: string): string {
	const trimmed = requested?.trim();
	if (!trimmed) return baseCwd;
	const target = isAbsolute(trimmed) ? trimmed : resolve(baseCwd, trimmed);
	if (!existsSync(target) || !statSync(target).isDirectory())
		throw new Error(`cwd 不是已存在的目录: ${target}`);
	return target;
}

/**
 * Model precedence: role-level override, then (for `explore`) the Repo Search
 * project/user configuration, then the parent's current model.
 */
export function resolveSpawnTarget(options: {
	role: SubagentRoleDefinition;
	cwd: string;
	projectTrusted: boolean;
	currentModel: { provider: string; id: string } | undefined;
}): SpawnTarget {
	const { role } = options;
	if (role.model) return { model: role.model, modelSource: "role" };
	if (role.name === "explore") {
		const config = resolveRepoSearchConfig(
			options.cwd,
			options.projectTrusted,
			options.currentModel,
		);
		return {
			model: config.model,
			modelSource: config.source,
			presentation: config.presentation,
		};
	}
	if (!options.currentModel)
		throw new Error(
			`角色 ${role.name} 未配置模型，且主 Agent 当前没有可继承的模型`,
		);
	return {
		model: `${options.currentModel.provider}/${options.currentModel.id}`,
		modelSource: "current",
	};
}
