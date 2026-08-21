import {
	DefaultPackageManager,
	getAgentDir,
	SettingsManager,
	type ResolvedResource,
} from "@earendil-works/pi-coding-agent";

export const REPO_SEARCH_TOOLS = [
	"read",
	"grep",
	"find",
	"ls",
	"lens_diagnostics",
	"lsp_diagnostics",
	"symbol_search",
	"project_report",
	"module_report",
	"read_symbol",
	"read_enclosing",
	"ast_grep_search",
	"ast_grep_outline",
	"ast_grep_dump",
] as const;

export function requestedPaths(input: {
	path?: unknown;
	paths?: unknown;
}): string[] {
	const paths = [
		...(typeof input.path === "string" ? [input.path] : []),
		...(Array.isArray(input.paths)
			? input.paths.filter((item): item is string => typeof item === "string")
			: []),
	];
	return paths.length > 0 ? paths : ["."];
}

export function extractPiLensExtensionPaths(
	resources: ResolvedResource[],
): string[] {
	return resources.flatMap((resource) =>
		resource.enabled && /^npm:pi-lens(?:@[^/]+)?$/.test(resource.metadata.source)
			? [resource.path]
			: [],
	);
}

export function extractRepoSearchExtensionPaths(
	resources: ResolvedResource[],
	model: string,
): string[] {
	return resources.flatMap((resource) => {
		if (!resource.enabled) return [];
		if (/^npm:pi-lens(?:@[^/]+)?$/.test(resource.metadata.source))
			return [resource.path];
		if (
			model.startsWith("cursor/") &&
			/^npm:@rahularya01\/pi-cursor(?:@[^/]+)?$/.test(resource.metadata.source)
		)
			return [resource.path];
		return [];
	});
}

export async function resolveRepoSearchExtensionPaths(
	cwd: string,
	projectTrusted: boolean,
	model: string,
): Promise<string[]> {
	try {
		const settingsManager = SettingsManager.create(cwd, getAgentDir(), {
			projectTrusted,
		});
		const packageManager = new DefaultPackageManager({
			cwd,
			agentDir: getAgentDir(),
			settingsManager,
		});
		const resources = await packageManager.resolve(async () => "skip");
		return extractRepoSearchExtensionPaths(resources.extensions, model);
	} catch {
		// Optional package resolution failures degrade to the isolated base tools.
		return [];
	}
}
