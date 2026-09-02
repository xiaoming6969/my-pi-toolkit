import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolveRepoSearchConfig } from "../subagent/repo-search/config.js";
import type { RepoSearchRunConfig } from "../subagent/repo-search/types.js";
import { thinkingLevelForModel } from "../shared/subagent/thinking-level.js";
import type { MultiTaskInput } from "./types.js";

export function currentThinkingLevel(model: string, ctx: ExtensionContext) {
	return thinkingLevelForModel(model, ctx.thinkingLevel, ctx.modelRegistry);
}

export function researchConfig(
	params: MultiTaskInput,
	ctx: ExtensionContext,
): RepoSearchRunConfig | undefined {
	if (!params.tasks?.some((task) => task.kind === "research")) return undefined;
	const config = resolveRepoSearchConfig(
		ctx.cwd,
		ctx.isProjectTrusted(),
		ctx.model,
	);
	return {
		...config,
		thinkingLevel: currentThinkingLevel(config.model, ctx),
	};
}
