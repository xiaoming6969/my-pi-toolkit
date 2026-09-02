import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";

const TOOLKIT_FILE = "ming-core.json";

type ProjectSection = "newConversation" | "repoSearch";

const USER_LEGACY = [
	{
		file: "model-manager.json",
		section: "newConversation",
		wrapRoot: false,
	},
	{
		file: "repo-search-subagent.json",
		section: "repoSearch",
		wrapRoot: true,
	},
	{
		file: "subagents.json",
		section: "subagents",
		wrapRoot: true,
	},
] as const;

const PROJECT_LEGACY: Record<ProjectSection, string> = {
	newConversation: "model-manager.json",
	repoSearch: "repo-search-subagent.json",
};

export function userToolkitConfigPath(): string {
	return join(getAgentDir(), TOOLKIT_FILE);
}

function parseObject(filePath: string, raw: string): Record<string, unknown> {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`无法解析 ${filePath}: ${message}`);
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`配置必须是 JSON 对象: ${filePath}`);
	}
	return value as Record<string, unknown>;
}

function readObjectFile(filePath: string): Record<string, unknown> | undefined {
	if (!existsSync(filePath)) return undefined;
	return parseObject(filePath, readFileSync(filePath, "utf8"));
}

function writeObjectFile(
	filePath: string,
	value: Record<string, unknown>,
): void {
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function importLegacySections(
	config: Record<string, unknown>,
	agentDir: string,
): string[] {
	const imported: string[] = [];
	for (const spec of USER_LEGACY) {
		if (config[spec.section] !== undefined) continue;
		const legacyPath = join(agentDir, spec.file);
		const raw = readObjectFile(legacyPath);
		if (!raw) continue;
		if (spec.wrapRoot) {
			config[spec.section] = raw;
			imported.push(legacyPath);
			continue;
		}
		if (raw[spec.section] === undefined) continue;
		config[spec.section] = raw[spec.section];
		imported.push(legacyPath);
	}
	return imported;
}

function persistImported(
	config: Record<string, unknown>,
	imported: string[],
): void {
	if (imported.length === 0) return;
	writeObjectFile(userToolkitConfigPath(), config);
	for (const filePath of imported) {
		renameSync(filePath, `${filePath}.${Date.now()}.migrated.bak`);
	}
}

export function readUserToolkitConfig(): Record<string, unknown> {
	const config = { ...(readObjectFile(userToolkitConfigPath()) ?? {}) };
	const imported = importLegacySections(config, getAgentDir());
	persistImported(config, imported);
	return config;
}

export function updateUserToolkitConfig(
	patch: Record<string, unknown>,
): string {
	const configPath = userToolkitConfigPath();
	const config = readUserToolkitConfig();
	Object.assign(config, patch);
	writeObjectFile(configPath, config);
	return configPath;
}

export function projectToolkitConfigPath(
	cwd: string,
	section: ProjectSection,
): string {
	const fallback = join(cwd, CONFIG_DIR_NAME, TOOLKIT_FILE);
	const legacyName = PROJECT_LEGACY[section];
	let current = resolve(cwd);
	while (true) {
		const dir = join(current, CONFIG_DIR_NAME);
		const toolkitPath = join(dir, TOOLKIT_FILE);
		if (existsSync(toolkitPath)) return toolkitPath;
		const legacyPath = join(dir, legacyName);
		if (existsSync(legacyPath)) return legacyPath;
		const parent = dirname(current);
		if (parent === current) return fallback;
		current = parent;
	}
}

export function readToolkitJsonFile(
	filePath: string,
): Record<string, unknown> | undefined {
	return readObjectFile(filePath);
}

export function projectSectionValue(
	raw: Record<string, unknown>,
	filePath: string,
	section: ProjectSection,
): unknown {
	if (
		section === "repoSearch" &&
		basename(filePath) === PROJECT_LEGACY.repoSearch
	) {
		return raw;
	}
	return raw[section];
}
