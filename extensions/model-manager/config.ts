import { existsSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	projectToolkitConfigPath,
	readToolkitJsonFile,
	readUserToolkitConfig,
	userToolkitConfigPath,
} from "../shared/toolkit-config.js";

type ThinkingLevel = ReturnType<ExtensionAPI["getThinkingLevel"]>;

const THINKING_LEVELS = new Set<ThinkingLevel>([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

interface NewConversationConfig {
	enabled?: boolean;
	model?: string;
	thinkingLevel?: ThinkingLevel;
}

interface ModelManagerConfig {
	newConversation?: NewConversationConfig;
}

export interface ResolvedNewConversationConfig {
	enabled: boolean;
	provider?: string;
	modelId?: string;
	thinkingLevel?: ThinkingLevel;
	source: "none" | "user" | "project";
	configPaths: string[];
}

function optionalBoolean(
	value: unknown,
	filePath: string,
): boolean | undefined {
	if (value === undefined || typeof value === "boolean") return value;
	throw new Error(`newConversation.enabled 必须是布尔值: ${filePath}`);
}

function optionalModel(value: unknown, filePath: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string" && value.trim() !== "") return value.trim();
	throw new Error(`newConversation.model 必须是非空字符串: ${filePath}`);
}

function optionalThinkingLevel(
	value: unknown,
	filePath: string,
): ThinkingLevel | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string" && THINKING_LEVELS.has(value as ThinkingLevel)) {
		return value as ThinkingLevel;
	}
	throw new Error(
		`newConversation.thinkingLevel 必须是 off、minimal、low、medium、high、xhigh 或 max: ${filePath}`,
	);
}

function parseConfig(
	value: Record<string, unknown> | undefined,
	filePath: string,
): ModelManagerConfig | undefined {
	if (!value) return undefined;
	const section = value.newConversation;
	if (section === undefined) return {};
	if (!section || typeof section !== "object" || Array.isArray(section)) {
		throw new Error(`newConversation 必须是 JSON 对象: ${filePath}`);
	}

	const input = section as Record<string, unknown>;
	return {
		newConversation: {
			enabled: optionalBoolean(input.enabled, filePath),
			model: optionalModel(input.model, filePath),
			thinkingLevel: optionalThinkingLevel(input.thinkingLevel, filePath),
		},
	};
}

function splitModel(value: string, filePath: string): [string, string] {
	const separator = value.indexOf("/");
	if (separator <= 0 || separator === value.length - 1) {
		throw new Error(
			`newConversation.model 必须使用 provider/model-id 格式: ${filePath}`,
		);
	}
	return [value.slice(0, separator), value.slice(separator + 1)];
}

export function userConfigPath(): string {
	return userToolkitConfigPath();
}

export function projectConfigPath(cwd: string): string {
	return projectToolkitConfigPath(cwd, "newConversation");
}

export function resolveNewConversationConfig(
	cwd: string,
	projectTrusted: boolean,
): ResolvedNewConversationConfig {
	const userPath = userConfigPath();
	const userRaw = readUserToolkitConfig();
	const userConfig =
		userRaw.newConversation !== undefined || existsSync(userPath)
			? parseConfig(userRaw, userPath)
			: undefined;
	const projectPath = projectConfigPath(cwd);
	const projectRaw = projectTrusted
		? readToolkitJsonFile(projectPath)
		: undefined;
	const projectConfig = parseConfig(projectRaw, projectPath);
	const configPaths = [
		...(userConfig ? [userPath] : []),
		...(projectConfig ? [projectPath] : []),
	];
	const merged = {
		...userConfig?.newConversation,
		...projectConfig?.newConversation,
	};

	if (configPaths.length === 0 || Object.keys(merged).length === 0) {
		return { enabled: false, source: "none", configPaths };
	}

	const enabled = merged.enabled ?? true;
	if (!merged.model) {
		if (!enabled) {
			return {
				enabled: false,
				thinkingLevel: merged.thinkingLevel,
				source: projectConfig ? "project" : "user",
				configPaths,
			};
		}
		const sourcePath = projectConfig ? projectPath : userPath;
		throw new Error(`newConversation.model 未配置: ${sourcePath}`);
	}

	const sourcePath = projectConfig?.newConversation?.model
		? projectPath
		: userPath;
	const [provider, modelId] = splitModel(merged.model, sourcePath);
	return {
		enabled,
		provider,
		modelId,
		thinkingLevel: merged.thinkingLevel,
		source: projectConfig ? "project" : "user",
		configPaths,
	};
}
