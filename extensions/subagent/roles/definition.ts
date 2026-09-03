import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { SubagentCapability } from "../../shared/subagent/capability.js";
import type {
	SubagentRoleDefinition,
	SubagentRoleOutput,
	SubagentRoleResources,
	SubagentRoleSource,
} from "./types.js";

const CAPABILITIES = new Set<SubagentCapability>([
	"read-only",
	"read-write",
	"execute",
	"all",
]);
const RESOURCES = new Set<SubagentRoleResources>(["lean", "inherit"]);
const ROLE_NAME = /^[a-z][a-z0-9-]{0,39}$/;

export interface RoleFieldsInput {
	name: string;
	source: SubagentRoleSource;
	/** Human-readable origin used in error messages. */
	origin: string;
	/** Directory that relative `promptFile` paths resolve against. */
	baseDir: string;
	fields: Record<string, unknown>;
	/** Markdown body used as the prompt when `fields.prompt` is absent. */
	body?: string;
}

function optionalString(
	fields: Record<string, unknown>,
	key: string,
	origin: string,
): string | undefined {
	const value = fields[key];
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string" || !value.trim())
		throw new Error(`${origin}: ${key} 必须是非空字符串`);
	return value.trim();
}

function toolList(value: unknown, origin: string): string[] {
	if (value === undefined || value === null) return [];
	const items = Array.isArray(value)
		? value
		: typeof value === "string"
			? value.split(",")
			: undefined;
	if (!items) throw new Error(`${origin}: tools 必须是字符串数组或逗号分隔字符串`);
	return items.map((item) => {
		if (typeof item !== "string" || !item.trim())
			throw new Error(`${origin}: tools 只能包含非空工具名`);
		return item.trim();
	});
}

const OUTPUT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function outputList(value: unknown, origin: string): SubagentRoleOutput[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value))
		throw new Error(`${origin}: outputs 必须是数组`);
	return value.map((item) => {
		if (!item || typeof item !== "object" || Array.isArray(item))
			throw new Error(`${origin}: outputs 的每一项必须是对象`);
		const record = item as Record<string, unknown>;
		const name = optionalString(record, "name", `${origin} outputs`);
		if (!name || !OUTPUT_NAME.test(name))
			throw new Error(
				`${origin}: outputs[].name 必须是合法文件名（字母、数字、点、下划线、连字符）`,
			);
		return {
			name,
			description: optionalString(record, "description", `${origin} outputs`) ?? "",
			required: record.required === true,
		};
	});
}

function resolvePrompt(input: RoleFieldsInput): string {
	const inline = optionalString(input.fields, "prompt", input.origin);
	if (inline) return inline;
	const file = optionalString(input.fields, "promptFile", input.origin);
	if (file) {
		const path = isAbsolute(file) ? file : resolve(input.baseDir, file);
		try {
			return readFileSync(path, "utf8").trim();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`${input.origin}: 无法读取 promptFile ${path}: ${message}`);
		}
	}
	const body = input.body?.trim();
	if (body) return body;
	throw new Error(`${input.origin}: 角色必须提供 prompt、promptFile 或 Markdown 正文`);
}

export function buildRoleDefinition(
	input: RoleFieldsInput,
): SubagentRoleDefinition {
	const { fields, origin } = input;
	if (!ROLE_NAME.test(input.name))
		throw new Error(
			`${origin}: 角色名 "${input.name}" 无效，只允许小写字母、数字和连字符`,
		);
	const capability = optionalString(fields, "capability", origin) ?? "read-only";
	if (!CAPABILITIES.has(capability as SubagentCapability))
		throw new Error(
			`${origin}: capability 必须是 read-only、read-write、execute 或 all`,
		);
	const resources =
		optionalString(fields, "resources", origin) ??
		(capability === "all" ? "inherit" : "lean");
	if (!RESOURCES.has(resources as SubagentRoleResources))
		throw new Error(`${origin}: resources 必须是 lean 或 inherit`);
	return {
		name: input.name,
		description: optionalString(fields, "description", origin) ?? "",
		capability: capability as SubagentCapability,
		systemPrompt: resolvePrompt(input),
		resources: resources as SubagentRoleResources,
		model: optionalString(fields, "model", origin),
		thinkingLevel: optionalString(fields, "thinkingLevel", origin),
		extraTools: toolList(fields.tools, origin),
		repoSearchGuard: fields.repoSearchGuard === true,
		contextFiles: fields.contextFiles !== false,
		outputs: outputList(fields.outputs, origin),
		source: input.source,
	};
}

/** Split a Markdown agent file into YAML frontmatter fields and body. */
export function parseAgentMarkdown(
	raw: string,
	origin: string,
): { fields: Record<string, unknown>; body: string } {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return { fields: {}, body: raw };
	let parsed: unknown;
	try {
		parsed = parseYaml(match[1]);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`${origin}: frontmatter 不是合法 YAML: ${message}`);
	}
	if (parsed === null || parsed === undefined) return { fields: {}, body: match[2] };
	if (typeof parsed !== "object" || Array.isArray(parsed))
		throw new Error(`${origin}: frontmatter 必须是键值映射`);
	return { fields: parsed as Record<string, unknown>, body: match[2] };
}
