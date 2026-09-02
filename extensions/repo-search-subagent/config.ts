import type { SubagentPresentation } from "../shared/subagent/config.js";
import {
	projectSectionValue,
	projectToolkitConfigPath,
	readToolkitJsonFile,
	readUserToolkitConfig,
	userToolkitConfigPath,
} from "../shared/toolkit-config.js";

interface RepoSearchSubagentConfig {
	model?: string;
	presentation?: SubagentPresentation;
}

export interface ResolvedRepoSearchConfig {
	model: string;
	source: "project" | "user" | "current";
	projectTrusted: boolean;
	configPath?: string;
	presentation?: SubagentPresentation;
}

function parseConfig(
	value: unknown,
	filePath: string,
): RepoSearchSubagentConfig | undefined {
	if (value === undefined) return undefined;
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Repo Search 子 Agent 配置必须是 JSON 对象: ${filePath}`);
	}

	const input = value as { model?: unknown; presentation?: unknown };
	const model = input.model;
	if (
		model !== undefined &&
		(typeof model !== "string" || model.trim() === "")
	) {
		throw new Error(
			`Repo Search 子 Agent 配置的 model 必须是非空字符串: ${filePath}`,
		);
	}

	const presentation = input.presentation;
	if (
		presentation !== undefined &&
		!["manual", "auto", "inline", "split", "tab"].includes(String(presentation))
	)
		throw new Error(
			`Repo Search 子 Agent 配置的 presentation 无效: ${filePath}`,
		);
	return {
		model: typeof model === "string" ? model.trim() : undefined,
		presentation: presentation as SubagentPresentation | undefined,
	};
}

export function userConfigPath(): string {
	return userToolkitConfigPath();
}

export function projectConfigPath(cwd: string): string {
	return projectToolkitConfigPath(cwd, "repoSearch");
}

export function resolveRepoSearchConfig(
	cwd: string,
	projectTrusted: boolean,
	currentModel: { provider: string; id: string } | undefined,
): ResolvedRepoSearchConfig {
	const projectPath = projectConfigPath(cwd);
	const projectRaw = projectTrusted
		? readToolkitJsonFile(projectPath)
		: undefined;
	const projectConfig = projectRaw
		? parseConfig(
				projectSectionValue(projectRaw, projectPath, "repoSearch"),
				projectPath,
			)
		: undefined;
	const userPath = userConfigPath();
	const userConfig = parseConfig(readUserToolkitConfig().repoSearch, userPath);
	const presentation = projectConfig?.presentation ?? userConfig?.presentation;
	if (projectConfig?.model)
		return {
			model: projectConfig.model,
			source: "project",
			projectTrusted,
			configPath: projectPath,
			presentation,
		};
	if (userConfig?.model)
		return {
			model: userConfig.model,
			source: "user",
			projectTrusted,
			configPath: userPath,
			presentation,
		};
	if (!currentModel) {
		throw new Error(
			`未配置 Repo Search 子 Agent 模型，且主 Agent 当前没有可继承的模型。请在 ${userPath} 中配置 { "repoSearch": { "model": "provider/model-id" } }。`,
		);
	}

	return {
		model: `${currentModel.provider}/${currentModel.id}`,
		source: "current",
		projectTrusted,
		presentation,
	};
}
