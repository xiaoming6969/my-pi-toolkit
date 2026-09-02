import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	truncateHead,
	type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { fetchBugDetail, htmlToText } from "../core/api.js";
import { longTapdObjectId } from "../core/object-id.js";
import { extractLocateReason } from "../documents/bug-reject-reason.js";
import { readTapdSessionState } from "../sessions/session-state.js";
import type { TapdConfig } from "../types.js";
import { fetchBugMrFields } from "./bug-fields.js";
import { git } from "./repository.js";
import type { TapdKeyword } from "./types.js";

const MAX_SECTION_BYTES = 24 * 1024;
const MAX_SECTION_LINES = 600;
const MAX_TEXT_CHARS = 4000;

function clipText(value: string, max = MAX_TEXT_CHARS): string {
	if (value.length <= max) return value;
	return `${value.slice(0, max)}\n\n…（已截断）`;
}

function clipGit(output: string): string {
	const truncation = truncateHead(output, {
		maxBytes: MAX_SECTION_BYTES,
		maxLines: MAX_SECTION_LINES,
	});
	return truncation.truncated
		? `${truncation.content}\n\n…（Git 输出已截断）`
		: truncation.content;
}

async function gitOutput(
	cwd: string,
	args: string[],
	signal?: AbortSignal,
): Promise<string> {
	try {
		return await git(cwd, args, signal);
	} catch (error) {
		return `（无法获取：${error instanceof Error ? error.message : String(error)}）`;
	}
}

function sessionLocateReason(
	ctx: ExtensionCommandContext,
	bug: TapdKeyword,
): string {
	const state = readTapdSessionState(ctx.sessionManager.getEntries());
	const longId = longTapdObjectId(bug.workspaceId, bug.shortId);
	if (
		state?.kind !== "bug" ||
		state.workspaceId !== bug.workspaceId ||
		(state.itemId !== bug.shortId &&
			state.itemId !== bug.objectId &&
			state.itemId !== longId)
	)
		return "";
	return extractLocateReason(ctx.sessionManager.getEntries());
}

export interface RootCauseEvidenceFiles {
	evidenceFile: string;
	cleanup: () => Promise<void>;
}

export async function collectRootCauseEvidence(options: {
	ctx: ExtensionCommandContext;
	config: TapdConfig;
	bug: TapdKeyword;
	cwd: string;
	targetBranch: string;
	signal?: AbortSignal;
}): Promise<RootCauseEvidenceFiles> {
	const { ctx, config, bug, cwd, targetBranch, signal } = options;
	const detail = await fetchBugDetail(
		bug.workspaceId,
		bug.shortId,
		config,
		signal,
	);
	const description = detail?.description
		? htmlToText(String(detail.description))
		: "";
	const locateReason = sessionLocateReason(ctx, bug);
	const base = await git(
		cwd,
		["merge-base", `origin/${targetBranch}`, "HEAD"],
		signal,
	);
	const fixStat = await gitOutput(cwd, ["diff", "--stat", base, "HEAD"], signal);
	const fixDiff = await gitOutput(
		cwd,
		["diff", "--no-color", base, "HEAD"],
		signal,
	);
	const fields = await fetchBugMrFields(config, bug.workspaceId, signal);
	const categoryOptions = fields.category?.leaves.map((leaf) => leaf.label) ?? [];
	const evidence = [
		`# Bug ${bug.shortId}`,
		"",
		`标题：${detail?.title ?? bug.name ?? "（未知）"}`,
		`Workspace：${bug.workspaceId}`,
		`对比分支：origin/${targetBranch}`,
		"",
		"## TAPD 描述",
		clipText(description || "（无描述）"),
		"",
		"## 会话定位原因",
		clipText(locateReason || "（当前会话没有可用的 /tapd bug 定位结论）"),
		"",
		"## 当前分支修复统计",
		clipGit(fixStat || "（无）"),
		"",
		"## 当前分支修复 diff",
		clipGit(fixDiff || "（无）"),
		"",
		"## 根因大类候选",
		categoryOptions.length > 0
			? categoryOptions.map((option) => `- ${option}`).join("\n")
			: "（未找到「根因大类」字段或没有候选值）",
	].join("\n");
	const dir = await mkdtemp(path.join(tmpdir(), "tapd-root-cause-"));
	const evidenceFile = path.join(dir, `bug-${bug.shortId}-evidence.md`);
	await writeFile(evidenceFile, evidence, { encoding: "utf8" });
	return {
		evidenceFile,
		cleanup: async () => {
			await rm(dir, { recursive: true, force: true });
		},
	};
}
