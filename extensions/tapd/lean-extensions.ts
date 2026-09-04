import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRepoSearchExtensionPaths } from "../subagent/repo-search/pi-lens.js";

const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const MODEL_EXTENSIONS = [
	resolve(EXTENSION_DIR, "../openai-compat-models/index.ts"),
].filter(existsSync);

/**
 * Lean TAPD children start with `--no-extensions`. Always load the toolkit
 * OpenAI-compat provider, and add `pi-cursor` when the model is `cursor/*`.
 */
export async function resolveTapdLeanExtensionPaths(
	cwd: string,
	projectTrusted: boolean,
	model: string,
): Promise<string[]> {
	return [
		...MODEL_EXTENSIONS,
		...(await resolveRepoSearchExtensionPaths(
			cwd,
			projectTrusted,
			model,
			false,
		)),
	];
}
