import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { waitForLiveSubagent } from "../../shared/subagent/registry.js";
import { runTerminalSubagent } from "../../shared/subagent/terminal-runner.js";
import { watchLiveSubagentOverlay } from "../../subagent-console/overlay.js";
import type { TapdConfig } from "../types.js";
import type { IntroducedCommitCandidate } from "./bug-analysis.js";
import { collectRootCauseEvidence } from "./root-cause-evidence.js";
import { parseGeneratedCauseAndFix } from "./root-cause-draft.js";
import {
	ROOT_CAUSE_SYSTEM_PROMPT,
	buildRootCauseTask,
} from "./root-cause-prompt.js";
import type { TapdKeyword } from "./types.js";
import { abortError } from "./working-cancel.js";

const READ_ONLY_TOOLS = "read";
const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const MODEL_EXTENSIONS = [
	resolve(EXTENSION_DIR, "../../openai-compat-models/index.ts"),
].filter(existsSync);

function currentModel(ctx: ExtensionCommandContext): string | undefined {
	const model = ctx.model;
	if (!model?.provider || !model.id) return undefined;
	return `${model.provider}/${model.id}`;
}

export async function generateBugRootCauseSummary(options: {
	ctx: ExtensionCommandContext;
	config: TapdConfig;
	bug: TapdKeyword;
	cwd: string;
	targetBranch: string;
	candidate: IntroducedCommitCandidate | undefined;
	signal?: AbortSignal;
}): Promise<{ cause: string; fix: string; category?: string } | null> {
	const { ctx, bug, cwd, candidate, signal } = options;
	if (signal?.aborted) throw abortError();
	const model = currentModel(ctx);
	if (!model) {
		ctx.ui.notify("当前会话没有可用模型，请手动填写产生原因和修复方式", "warning");
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
		const running = runTerminalSubagent({
			cwd,
			title,
			model,
			thinkingLevel: ctx.thinkingLevel,
			task: buildRootCauseTask({
				bugId: bug.shortId,
				workspaceId: bug.workspaceId,
				evidenceFile: evidence.evidenceFile,
				introducedCommit: candidate?.hash,
			}),
			systemPrompt: ROOT_CAUSE_SYSTEM_PROMPT,
			tools: READ_ONLY_TOOLS,
			extensionPaths: MODEL_EXTENSIONS,
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
				`Bug ${bug.shortId}: 已取消根因总结，请手动填写产生原因和修复方式`,
				"warning",
			);
			return null;
		}
		const parsed = parseGeneratedCauseAndFix(result?.output ?? "");
		if (!parsed) {
			ctx.ui.notify(
				`Bug ${bug.shortId}: 子 Agent 未返回可用的产生原因/修复，请手动填写`,
				"warning",
			);
			return null;
		}
		return parsed;
	} catch (error) {
		const overlayReason = await overlay;
		if (signal?.aborted) throw abortError();
		if (overlayReason === "aborted") {
			ctx.ui.notify(
				`Bug ${bug.shortId}: 已取消根因总结，请手动填写产生原因和修复方式`,
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
