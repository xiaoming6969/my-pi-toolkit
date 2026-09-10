import { parseUnifiedDiff } from "./diff-parser.js";
import { renderDiffHtml } from "./d2h-html.js";
import type {
	BrowserReviewKind,
	BrowserReviewSource,
	DiffFileEntry,
	ReviewLine,
} from "./types.js";

export function codeReviewSource(
	title: string,
	patch: string,
	subtitle?: string,
): BrowserReviewSource {
	const lines = parseUnifiedDiff(patch, { highlight: false });
	return {
		kind: "code",
		title,
		subtitle,
		lines,
		files: listDiffFiles(lines),
		diffHtml: renderDiffHtml(patch, "side-by-side"),
		diffHtmlInline: renderDiffHtml(patch, "line-by-line"),
	};
}

export async function textReviewSource(
	kind: Exclude<BrowserReviewKind, "code">,
	title: string,
	content: string,
	subtitle?: string,
): Promise<BrowserReviewSource> {
	const { renderMarkdownBlocks } = await import("./markdown-preview.js");
	return {
		kind,
		title,
		subtitle,
		lines: content.split(/\r?\n/).map((text) => ({ text, style: "plain" })),
		markdownBlocks: renderMarkdownBlocks(content),
	};
}

function listDiffFiles(lines: ReviewLine[]): DiffFileEntry[] {
	const files: DiffFileEntry[] = [];
	const index = new Map<string, DiffFileEntry>();
	for (const line of lines) {
		if (line.style === "file" && line.file && !index.has(line.file)) {
			const entry = { path: line.file, added: 0, removed: 0 };
			index.set(line.file, entry);
			files.push(entry);
		}
		const entry = line.file ? index.get(line.file) : undefined;
		if (!entry) continue;
		if (line.style === "addition") entry.added += 1;
		else if (line.style === "deletion") entry.removed += 1;
	}
	return files;
}
