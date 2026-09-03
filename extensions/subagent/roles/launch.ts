import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SubagentPresentation } from "../../shared/subagent/config.js";
import type { SubagentTurnUpdate } from "../../shared/subagent/registry.js";
import {
	runSubagent,
	type SubagentRunResult,
} from "../../shared/subagent/run.js";
import { resolveRepoSearchExtensionPaths } from "../repo-search/pi-lens.js";
import type { SubagentRoleDefinition } from "./types.js";

const ROLES_DIR = dirname(fileURLToPath(import.meta.url));
const GITIGNORE_GUARD_EXTENSION = resolve(
	ROLES_DIR,
	"../repo-search/gitignore-guard.ts",
);
/** Custom provider definitions a lean child needs to resolve toolkit models. */
const MODEL_EXTENSIONS = [
	resolve(ROLES_DIR, "../../openai-compat-models/index.ts"),
].filter(existsSync);

export interface RoleLaunchOptions {
	role: SubagentRoleDefinition;
	cwd: string;
	title: string;
	task: string;
	model: string;
	thinkingLevel?: string;
	projectTrusted: boolean;
	/** Parent tool snapshot; required by roles with capability `all`. */
	parentTools?: readonly string[];
	presentation?: SubagentPresentation;
	keepOpen?: boolean;
	parentSessionId?: string;
	artifactFiles?: string[];
	env?: Record<string, string>;
	signal?: AbortSignal;
	onUpdate?: (update: SubagentTurnUpdate) => void;
}

async function leanExtensionPaths(options: RoleLaunchOptions): Promise<string[]> {
	const optional = await resolveRepoSearchExtensionPaths(
		options.cwd,
		options.projectTrusted,
		options.model,
		options.role.repoSearchGuard,
	);
	return [
		...(options.role.repoSearchGuard ? [GITIGNORE_GUARD_EXTENSION] : []),
		...MODEL_EXTENSIONS,
		...optional,
	];
}

/**
 * Launch one turn of a role-defined subagent. Lean roles stay isolated with
 * `--no-extensions` plus only the extensions they need; inherit roles load the
 * parent's normal resources so they can reuse its tools and skills.
 */
export async function runRoleSubagent(
	options: RoleLaunchOptions,
): Promise<SubagentRunResult> {
	const { role } = options;
	const inherit = role.resources === "inherit";
	return runSubagent({
		cwd: options.cwd,
		title: options.title,
		model: options.model,
		thinkingLevel: options.thinkingLevel,
		task: options.task,
		systemPrompt: role.systemPrompt,
		capability: role.capability,
		availableTools: options.parentTools,
		extraTools: role.extraTools,
		extensionPaths: inherit ? [] : await leanExtensionPaths(options),
		loadDefaultResources: inherit,
		disableContextFiles: !role.contextFiles,
		presentation: options.presentation,
		keepOpen: options.keepOpen,
		parentSessionId: options.parentSessionId,
		artifactFiles: options.artifactFiles,
		env: options.env,
		signal: options.signal,
		onUpdate: options.onUpdate,
	});
}
