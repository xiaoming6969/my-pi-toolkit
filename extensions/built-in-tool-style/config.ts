import {
	readUserToolkitConfig,
	updateUserToolkitConfig,
	userToolkitConfigPath,
} from "../shared/toolkit-config.js";

export const BUILTIN_TOOL_NAMES = [
	"read",
	"write",
	"edit",
	"bash",
	"grep",
	"find",
	"ls",
] as const;

export const READ_ONLY_TOOL_NAMES = ["read", "grep", "find", "ls"] as const;

export type BuiltinToolName = (typeof BUILTIN_TOOL_NAMES)[number];
export type BuiltinToolStyle = "native" | "grok" | BuiltinToolName[];
export const DEFAULT_BUILTIN_TOOL_STYLE: BuiltinToolStyle = "grok";

export interface ResolvedBuiltinToolStyle {
	style: BuiltinToolStyle;
	enabledTools: BuiltinToolName[];
	configPath: string;
}

function isToolName(value: unknown): value is BuiltinToolName {
	return (
		typeof value === "string" &&
		BUILTIN_TOOL_NAMES.includes(value as BuiltinToolName)
	);
}

function parseStyle(value: unknown, configPath: string): BuiltinToolStyle {
	if (value === undefined || value === "native" || value === "grok") {
		return value ?? DEFAULT_BUILTIN_TOOL_STYLE;
	}
	if (Array.isArray(value) && value.every(isToolName)) {
		return Array.from(new Set(value));
	}
	throw new Error(
		`builtinToolStyle 必须是 native、grok 或工具名称数组: ${configPath}`,
	);
}

export function resolveBuiltinToolStyle(): ResolvedBuiltinToolStyle {
	const configPath = userToolkitConfigPath();
	const config = readUserToolkitConfig();
	const style = parseStyle(config.builtinToolStyle, configPath);
	let enabledTools: BuiltinToolName[];
	if (style === "native") enabledTools = [];
	else if (style === "grok") enabledTools = [...BUILTIN_TOOL_NAMES];
	else enabledTools = style;
	return { style, enabledTools, configPath };
}

export function writeBuiltinToolStyle(style: BuiltinToolStyle): string {
	return updateUserToolkitConfig({ builtinToolStyle: style });
}
