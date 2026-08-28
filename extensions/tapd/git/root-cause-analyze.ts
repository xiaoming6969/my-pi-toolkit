import type {
	ExtensionAPI,
	ExtensionCommandContext,
	SessionEntry,
	SessionMessageEntry,
} from "@earendil-works/pi-coding-agent";
import type { TapdConfig } from "../types.js";
import type { IntroducedCommitCandidate } from "./bug-analysis.js";
import { parseGeneratedCauseAndFix } from "./root-cause-draft.js";
import { collectRootCauseEvidence } from "./root-cause-evidence.js";
import {
	buildRootCauseDelegationMessage,
	buildRootCauseTask,
} from "./root-cause-prompt.js";
import type { TapdKeyword } from "./types.js";
import { abortError, isAbortError } from "./working-cancel.js";

function currentModel(ctx: ExtensionCommandContext): string | undefined {
	const model = ctx.model;
	if (!model?.provider || !model.id) return undefined;
	return `${model.provider}/${model.id}`;
}

function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.flatMap((part) => {
			if (typeof part === "string") return [part];
			if (!part || typeof part !== "object") return [];
			const item = part as { type?: string; text?: string };
			return item.type === "text" && typeof item.text === "string"
				? [item.text]
				: [];
		})
		.join("\n");
}

export function lastAssistantText(entries: readonly SessionEntry[]): string {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry.type !== "message") continue;
		const message = (entry as SessionMessageEntry).message as {
			role?: string;
			content?: unknown;
		};
		if (message?.role !== "assistant") continue;
		const text = messageText(message.content).trim();
		if (text) return text;
	}
	return "";
}

async function waitUntilIdle(
	ctx: ExtensionCommandContext,
	signal?: AbortSignal,
): Promise<void> {
	if (signal?.aborted) throw abortError();
	await new Promise<void>((resolve, reject) => {
		const onAbort = () => reject(abortError());
		signal?.addEventListener("abort", onAbort, { once: true });
		void ctx.waitForIdle().then(
			() => {
				signal?.removeEventListener("abort", onAbort);
				resolve();
			},
			(error: unknown) => {
				signal?.removeEventListener("abort", onAbort);
				reject(error);
			},
		);
	});
}

export async function requestRootCauseFromAgent(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	task: string,
	signal?: AbortSignal,
): Promise<string> {
	if (signal?.aborted) throw abortError();
	pi.sendMessage(
		{
			customType: "tapd-root-cause-request",
			content: buildRootCauseDelegationMessage(task),
			display: false,
		},
		{ triggerTurn: true },
	);
	await waitUntilIdle(ctx, signal);
	return lastAssistantText(ctx.sessionManager.getEntries());
}

export async function generateBugRootCauseSummary(options: {
	pi: ExtensionAPI;
	ctx: ExtensionCommandContext;
	config: TapdConfig;
	bug: TapdKeyword;
	cwd: string;
	targetBranch: string;
	candidate: IntroducedCommitCandidate | undefined;
	signal?: AbortSignal;
}): Promise<{ cause: string; fix: string; category?: string } | null> {
	const { pi, ctx, bug, candidate, signal } = options;
	if (signal?.aborted) throw abortError();
	if (!currentModel(ctx)) {
		ctx.ui.notify("当前会话没有可用模型，请手动填写产生原因和修复方式", "warning");
		return null;
	}
	let evidence: Awaited<ReturnType<typeof collectRootCauseEvidence>> | undefined;
	try {
		evidence = await collectRootCauseEvidence({ ...options, signal });
		if (signal?.aborted) throw abortError();
		const output = await requestRootCauseFromAgent(
			pi,
			ctx,
			buildRootCauseTask({
				bugId: bug.shortId,
				workspaceId: bug.workspaceId,
				evidenceFile: evidence.evidenceFile,
				introducedCommit: candidate?.hash,
			}),
			signal,
		);
		const parsed = parseGeneratedCauseAndFix(output);
		if (!parsed) {
			ctx.ui.notify(
				`Bug ${bug.shortId}: Agent 未返回可用的产生原因/修复，请手动填写`,
				"warning",
			);
			return null;
		}
		return parsed;
	} catch (error) {
		if (isAbortError(error) || signal?.aborted) throw abortError();
		ctx.ui.notify(
			`Bug ${bug.shortId}: 根因总结失败，请手动填写 - ${error instanceof Error ? error.message : String(error)}`,
			"warning",
		);
		return null;
	} finally {
		await evidence?.cleanup();
	}
}
