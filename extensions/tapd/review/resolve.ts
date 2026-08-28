import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getDesignDocPath, getUnderstandingDocPath } from "../sessions/docs.js";
import { readTapdSessionState } from "../sessions/session-state.js";
import type { TapdReviewTarget } from "./types.js";

async function requireDocument(path: string, command: string): Promise<void> {
	let content: string;
	try {
		content = await readFile(path, "utf8");
	} catch {
		throw new Error(`未找到 ${path}，请先执行 ${command}`);
	}
	if (!content.trim()) throw new Error(`${path} 为空，请先完善文档`);
}

export async function resolveTapdReviewTarget(
	ctx: ExtensionCommandContext,
): Promise<TapdReviewTarget> {
	const state = readTapdSessionState(ctx.sessionManager.getEntries());
	if (!state)
		throw new Error("当前会话没有关联 TAPD 需求，请先从待办创建或切换会话");
	if (state.kind === "bug")
		throw new Error("/tapd review 仅支持需求会话，不支持 Bug 会话");

	const storyId = state.itemId;
	const documentId = `story-${storyId}`;
	const understandingFile =
		state.understandingFile ?? getUnderstandingDocPath(ctx.cwd, documentId);
	const designFile = state.understandingFile
		? join(dirname(state.understandingFile), "design.md")
		: getDesignDocPath(ctx.cwd, documentId);
	await requireDocument(understandingFile, "/tapd analyze");
	await requireDocument(designFile, "/tapd design");
	return {
		storyId,
		storyName: state.itemName,
		understandingFile,
		designFile,
	};
}
