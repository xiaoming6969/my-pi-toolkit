import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import {
	readUserToolkitConfig,
	userToolkitConfigPath,
} from "../../shared/toolkit-config.js";
import { BUILTIN_SUBAGENT_ROLES } from "./builtin.js";
import { buildRoleDefinition, parseAgentMarkdown } from "./definition.js";
import type { SubagentRoleDefinition } from "./types.js";

const AGENTS_DIR_NAME = "agents";

export interface RoleLoadOptions {
	cwd: string;
	projectTrusted: boolean;
	/** Overrides for tests; defaults read the real user config and disk. */
	userConfig?: Record<string, unknown>;
	userConfigPath?: string;
}

function readSection(value: unknown, origin: string): Record<string, unknown> {
	if (value === undefined || value === null) return {};
	if (typeof value !== "object" || Array.isArray(value))
		throw new Error(`${origin} 必须是 JSON 对象`);
	return value as Record<string, unknown>;
}

function loadUserRoles(options: RoleLoadOptions): SubagentRoleDefinition[] {
	const configPath = options.userConfigPath ?? userToolkitConfigPath();
	const config = options.userConfig ?? readUserToolkitConfig();
	const subagents = readSection(config.subagents, `${configPath} 的 subagents`);
	const roles = readSection(subagents.roles, `${configPath} 的 subagents.roles`);
	return Object.entries(roles).map(([name, value]) =>
		buildRoleDefinition({
			name,
			source: "user",
			origin: `${configPath} subagents.roles.${name}`,
			baseDir: dirname(configPath) || getAgentDir(),
			fields: readSection(value, `${configPath} subagents.roles.${name}`),
		}),
	);
}

/** Nearest `.pi/agents/` directory walking up from cwd. */
export function findProjectAgentsDir(cwd: string): string | undefined {
	let current = resolve(cwd);
	while (true) {
		const candidate = join(current, CONFIG_DIR_NAME, AGENTS_DIR_NAME);
		if (existsSync(candidate) && statSync(candidate).isDirectory())
			return candidate;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function loadProjectRoles(agentsDir: string): SubagentRoleDefinition[] {
	return readdirSync(agentsDir)
		.filter((file) => file.endsWith(".md"))
		.sort()
		.map((file) => {
			const path = join(agentsDir, file);
			const { fields, body } = parseAgentMarkdown(
				readFileSync(path, "utf8"),
				path,
			);
			const name =
				typeof fields.name === "string" && fields.name.trim()
					? fields.name.trim()
					: basename(file, ".md");
			return buildRoleDefinition({
				name,
				source: "project",
				origin: path,
				baseDir: agentsDir,
				fields,
				body,
			});
		});
}

/**
 * Resolve the effective role table. Precedence: trusted project
 * `.pi/agents/*.md` > user `ming-core.json` `subagents.roles` > built-ins.
 * Untrusted projects contribute nothing.
 */
export function loadSubagentRoles(
	options: RoleLoadOptions,
): Map<string, SubagentRoleDefinition> {
	const roles = new Map<string, SubagentRoleDefinition>();
	for (const role of BUILTIN_SUBAGENT_ROLES) roles.set(role.name, role);
	for (const role of loadUserRoles(options)) roles.set(role.name, role);
	const agentsDir = options.projectTrusted
		? findProjectAgentsDir(options.cwd)
		: undefined;
	if (agentsDir)
		for (const role of loadProjectRoles(agentsDir)) roles.set(role.name, role);
	return roles;
}

export function getSubagentRole(
	name: string,
	options: RoleLoadOptions,
): SubagentRoleDefinition {
	const roles = loadSubagentRoles(options);
	const role = roles.get(name.trim());
	if (role) return role;
	throw new Error(
		`未知的子 Agent 角色 "${name}"，可用角色: ${Array.from(roles.keys()).join(", ")}`,
	);
}
