import type { BrowserReviewKind, BrowserReviewSource } from "./types.js";

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
