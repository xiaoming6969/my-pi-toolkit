import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { IntroducedCommitCandidate } from "./bug-analysis.js";
import { git } from "./repository.js";

export interface BugRootCauseDraft {
	head: string;
	bugId: string;
	cause: string;
	impact: string;
	introducedCommit: string;
	commitInfo: string;
	fix: string;
	category?: string;
}

async function draftPath(cwd: string, bugId: string): Promise<string> {
	const root = await git(cwd, ["rev-parse", "--show-toplevel"]);
	const dir = path.join(root, ".pi", "tapd-root-cause");
	await mkdir(dir, { recursive: true });
	return path.join(dir, `${bugId}.json`);
}

export async function deleteBugRootCauseDraft(
	cwd: string,
	bugId: string,
): Promise<void> {
	await rm(await draftPath(cwd, bugId), { force: true });
}

export async function loadBugRootCauseDraft(
	cwd: string,
	bugId: string,
	head: string,
): Promise<BugRootCauseDraft | null> {
	try {
		const content = await readFile(await draftPath(cwd, bugId), "utf8");
		const draft = JSON.parse(content) as Partial<BugRootCauseDraft>;
		if (
			draft.head !== head ||
			draft.bugId !== bugId ||
			typeof draft.cause !== "string" ||
			typeof draft.impact !== "string" ||
			typeof draft.introducedCommit !== "string" ||
			typeof draft.commitInfo !== "string" ||
			typeof draft.fix !== "string"
		)
			return null;
		return {
			...(draft as BugRootCauseDraft),
			category:
				typeof draft.category === "string" ? draft.category : undefined,
		};
	} catch {
		return null;
	}
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SECTION_LABELS = [
	"根因分析（RCA）",
	"产生原因",
	"影响范围",
	"修复方案说明",
	"修复",
	"引入commit",
	"commit信息",
	"根因大类",
];
const SECTION_NAMES = SECTION_LABELS.map(escapeRegExp).join("|");

function sectionValue(text: string, label: string): string {
	const match = text.match(
		new RegExp(
			`【${escapeRegExp(label)}】\\s*([\\s\\S]*?)(?=\\n【(?:${SECTION_NAMES})】|$)`,
			"i",
		),
	);
	return match?.[1]?.trim() ?? "";
}

function firstSection(text: string, labels: string[]): string {
	for (const label of labels) {
		const value = sectionValue(text, label);
		if (value) return value;
	}
	return "";
}

export function parseGeneratedCauseAndFix(text: string): {
	cause: string;
	impact: string;
	fix: string;
	category?: string;
	introducedCommit?: string;
} | null {
	const body = text.replace(/```[\w]*\n?([\s\S]*?)```/g, "$1").trim();
	const cause = firstSection(body, ["根因分析（RCA）", "产生原因"]);
	const impact = sectionValue(body, "影响范围");
	const introducedCommit = sectionValue(body, "引入commit");
	const fix = firstSection(body, ["修复方案说明", "修复"]);
	const category = sectionValue(body, "根因大类");
	if (!cause && !fix) return null;
	return {
		cause,
		impact,
		fix,
		category: category || undefined,
		introducedCommit: introducedCommit || undefined,
	};
}

export function parseBugRootCauseEditor(
	text: string,
	bugId: string,
	head: string,
): BugRootCauseDraft {
	const cause = firstSection(text, ["根因分析（RCA）", "产生原因"]);
	const impact = sectionValue(text, "影响范围");
	const introducedCommit = sectionValue(text, "引入commit");
	const commitInfo = sectionValue(text, "commit信息");
	const fix = firstSection(text, ["修复方案说明", "修复"]);
	if (!cause) throw new Error(`Bug ${bugId}: 请填写【根因分析（RCA）】`);
	if (!impact) throw new Error(`Bug ${bugId}: 请填写【影响范围】`);
	if (!fix) throw new Error(`Bug ${bugId}: 请填写【修复方案说明】`);
	if (!introducedCommit)
		throw new Error(`Bug ${bugId}: 请保留【引入commit】，或填写“未能定位”`);
	if (!commitInfo) throw new Error(`Bug ${bugId}: 请保留【commit信息】`);
	return {
		head,
		bugId,
		cause,
		impact,
		introducedCommit: introducedCommit.split(/\s+/)[0] ?? introducedCommit,
		commitInfo,
		fix,
	};
}

export function renderBugRootCauseDraft(draft: BugRootCauseDraft): string {
	return [
		`【根因分析（RCA）】${draft.cause}`,
		"",
		`【影响范围】${draft.impact}`,
		"",
		`【修复方案说明】${draft.fix}`,
		"",
		`【引入commit】${draft.introducedCommit}`,
		"",
		`【commit信息】${draft.commitInfo}`,
	].join("\n");
}

export async function collectManualBugRootCauseDraft(
	ctx: ExtensionCommandContext,
	bugId: string,
	head: string,
	candidate: IntroducedCommitCandidate | undefined,
	prefill?: { cause?: string; impact?: string; fix?: string },
): Promise<BugRootCauseDraft | null> {
	const introduced = candidate?.hash ?? "未能定位";
	const commitInfo = candidate
		? `${candidate.shortHash} ${candidate.date} ${candidate.author} ${candidate.subject}`
		: "未能定位到引入该 bug 的 commit";
	const template = renderBugRootCauseDraft({
		head,
		bugId,
		cause: prefill?.cause ?? "",
		impact: prefill?.impact ?? "",
		introducedCommit: introduced,
		commitInfo,
		fix: prefill?.fix ?? "",
	});
	const edited = await ctx.ui.editor(
		`Bug ${bugId}: 请确认或修改根因分析、影响范围和修复方案说明`,
		`${template}\n`,
	);
	if (!edited) return null;
	return parseBugRootCauseEditor(edited, bugId, head);
}
