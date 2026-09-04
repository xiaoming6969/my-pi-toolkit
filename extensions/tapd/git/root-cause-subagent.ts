import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { waitForLiveSubagent } from "../../shared/subagent/registry.js";
import { runSubagent } from "../../shared/subagent/run.js";
import { thinkingLevelForModel } from "../../shared/subagent/thinking-level.js";
import { watchLiveSubagentOverlay } from "../../subagent/console/overlay.js";
import { resolveTapdLeanExtensionPaths } from "../lean-extensions.js";
import type { TapdConfig } from "../types.js";
import {
	resolveIntroducedCommit,
	type IntroducedCommitCandidate,
} from "./bug-analysis.js";
import { collectRootCauseEvidence } from "./root-cause-evidence.js";
import { parseGeneratedCauseAndFix } from "./root-cause-draft.js";
import {
	resolveRootCauseModel,
	resolveRootCauseThinkingLevel,
} from "./root-cause-model.js";
import {
	ROOT_CAUSE_SYSTEM_PROMPT,
	buildRootCauseTask,
} from "./root-cause-prompt.js";
import type { TapdKeyword } from "./types.js";
import { abortError } from "./working-cancel.js";

export async function generateBugRootCauseSummary(options: {
	ctx: ExtensionCommandContext;
	config: TapdConfig;
	bug: TapdKeyword;
	cwd: string;
	targetBranch: string;
	signal?: AbortSignal;
}): Promise<{
	cause: string;
	impact: string;
	fix: string;
	category?: string;
	candidate?: IntroducedCommitCandidate;
} | null> {
	const { ctx, config, bug, cwd, targetBranch, signal } = options;
	if (signal?.aborted) throw abortError();
	let model: string;
	let thinkingLevel: string | undefined;
	try {
		model = resolveRootCauseModel(config, ctx.model);
		thinkingLevel = thinkingLevelForModel(
			model,
			resolveRootCauseThinkingLevel(config, ctx.thinkingLevel),
			ctx.modelRegistry,
		);
	} catch (error) {
		ctx.ui.notify(
			`${error instanceof Error ? error.message : String(error)}，请手动填写根因分析和修复方案`,
			"warning",
		);
		return null;
	}
	const title = `TAPD Bug ${bug.shortId} 根因总结`;
	const parentSessionId = ctx.sessionManager.getSessionId();
	let evidence: Awaited<ReturnType<typeof collectRootCauseEvidence>> | undefined;
	let overlay: Promise<"aborted" | undefined> | undefined;
	try {
		evidence = await collectRootCauseEvidence({
			...options,
			signal,
		});
		if (signal?.aborted) throw abortError();
		const running = runSubagent({
			cwd,
			title,
			model,
			thinkingLevel,
			task: buildRootCauseTask({
				bugId: bug.shortId,
				workspaceId: bug.workspaceId,
				evidenceFile: evidence.evidenceFile,
				targetBranch,
			}),
			systemPrompt: ROOT_CAUSE_SYSTEM_PROMPT,
			// Read-only inspection plus `bash` for git history lookups; no edit/write.
			capability: "execute",
			extensionPaths: await resolveTapdLeanExtensionPaths(
				cwd,
				ctx.isProjectTrusted(),
				model,
			),
			artifactFiles: [evidence.evidenceFile],
			disableContextFiles: true,
			keepOpen: false,
			presentation: "manual",
			parentSessionId,
			signal,
		});
		overlay = (async () => {
			const run = await Promise.race([
				waitForLiveSubagent(
					(item) =>
						item.title === title && item.parentSessionId === parentSessionId,
					signal,
				),
				running.then(
					() => undefined,
					() => undefined,
				),
			]);
			if (!run || signal?.aborted) return undefined;
			const reason = await watchLiveSubagentOverlay(ctx, run);
			return reason === "aborted" ? "aborted" : undefined;
		})().catch(() => undefined);
		const result = await running;
		if (signal?.aborted) throw abortError();
		if ((await overlay) === "aborted") {
			ctx.ui.notify(
				`Bug ${bug.shortId}: 已取消根因总结，请手动填写根因分析和修复方案`,
				"warning",
			);
			return null;
		}
		const parsed = parseGeneratedCauseAndFix(result.output);
		if (!parsed) {
			ctx.ui.notify(
				`Bug ${bug.shortId}: 子 Agent 未返回可用的根因分析/修复方案，请手动填写`,
				"warning",
			);
			return null;
		}
		const candidate = await resolveIntroducedCommit(
			cwd,
			parsed.introducedCommit,
		);
		if (
			!candidate &&
			parsed.introducedCommit &&
			/^[0-9a-f]{7,40}/i.test(parsed.introducedCommit.trim())
		) {
			ctx.ui.notify(
				`Bug ${bug.shortId}: 引入 commit 无效或不在当前 HEAD 历史中，将按未能定位预填`,
				"warning",
			);
		}
		return { ...parsed, candidate };
	} catch (error) {
		const overlayReason = await overlay;
		if (signal?.aborted) throw abortError();
		if (overlayReason === "aborted") {
			ctx.ui.notify(
				`Bug ${bug.shortId}: 已取消根因总结，请手动填写根因分析和修复方案`,
				"warning",
			);
			return null;
		}
		ctx.ui.notify(
			`Bug ${bug.shortId}: 根因总结失败，请手动填写 - ${error instanceof Error ? error.message : String(error)}`,
			"warning",
		);
		return null;
	} finally {
		await overlay;
		await evidence?.cleanup();
	}
}
