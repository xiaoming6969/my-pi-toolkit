import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { showMarkdownPreview } from "../../shared/tui/markdown-preview-overlay.js";
import { getUnderstandingDocPath } from "../sessions/docs.js";
import { readTapdSessionState } from "../sessions/session-state.js";

export type TapdDocumentKind =
	| "understanding"
	| "design"
	| "collaboration";

export interface TapdDocumentSnapshot {
	kind: TapdDocumentKind;
	path: string;
	content: string | undefined;
}

const DOCUMENTS: Record<
	TapdDocumentKind,
	{ label: string; fileName: string; command: string }
> = {
	understanding: {
		label: "需求理解",
		fileName: "understanding.md",
		command: "/tapd analyze",
	},
	design: {
		label: "设计方案",
		fileName: "design.md",
		command: "/tapd design",
	},
	collaboration: {
		label: "协作文档",
		fileName: "collaboration.md",
		command: "/tapd collaboration",
	},
};

export function isTapdDocumentKind(value: string): value is TapdDocumentKind {
	return Object.prototype.hasOwnProperty.call(DOCUMENTS, value);
}

async function readContent(path: string): Promise<string | undefined> {
	try {
		const content = await readFile(path, "utf8");
		return content.trim() ? content : undefined;
	} catch {
		return undefined;
	}
}

function documentPath(
	ctx: ExtensionContext,
	kind: TapdDocumentKind,
): string | undefined {
	const state = readTapdSessionState(ctx.sessionManager.getEntries());
	if (!state || state.kind !== "story") return undefined;
	const understandingPath =
		state.understandingFile ??
		getUnderstandingDocPath(ctx.cwd, `story-${state.itemId}`);
	return kind === "understanding"
		? understandingPath
		: join(dirname(understandingPath), DOCUMENTS[kind].fileName);
}

export async function snapshotTapdDocument(
	ctx: ExtensionContext,
	kind: TapdDocumentKind,
): Promise<TapdDocumentSnapshot | undefined> {
	const path = documentPath(ctx, kind);
	if (!path) return undefined;
	return { kind, path, content: await readContent(path) };
}

async function showSnapshot(
	ctx: ExtensionContext,
	snapshot: TapdDocumentSnapshot,
): Promise<void> {
	await showMarkdownPreview(ctx, {
		title: `TAPD · ${DOCUMENTS[snapshot.kind].label}`,
		path: snapshot.path,
		content: snapshot.content,
	});
}

export async function previewTapdDocument(
	ctx: ExtensionContext,
	kind?: TapdDocumentKind,
): Promise<void> {
	let selected = kind;
	if (!selected) {
		const choices = Object.entries(DOCUMENTS).map(
			([key, document]) => `${key} · ${document.label}`,
		);
		const choice = await ctx.ui.select("TAPD DOCUMENT PREVIEW", choices);
		if (!choice) return;
		selected = choice.split(" ", 1)[0] as TapdDocumentKind;
	}

	const snapshot = await snapshotTapdDocument(ctx, selected);
	if (!snapshot) {
		ctx.ui.notify("当前会话没有关联 TAPD 需求", "warning");
		return;
	}
	if (!snapshot.content) {
		ctx.ui.notify(
			`${DOCUMENTS[selected].fileName} 不存在或为空，请先执行 ${DOCUMENTS[selected].command}`,
			"warning",
		);
		return;
	}
	await showSnapshot(ctx, snapshot);
}

export async function previewUpdatedTapdDocument(
	ctx: ExtensionContext,
	before: TapdDocumentSnapshot,
): Promise<void> {
	const content = await readContent(before.path);
	if (!content || content === before.content) {
		ctx.ui.notify(
			`${DOCUMENTS[before.kind].fileName} 未生成新内容，未打开预览`,
			"warning",
		);
		return;
	}
	await showSnapshot(ctx, { ...before, content });
}
