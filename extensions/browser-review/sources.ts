import { renderMarkdownBlocks } from "./markdown-preview.js";
import type { BrowserReviewKind, BrowserReviewSource } from "./types.js";

export function textReviewSource(
	kind: Exclude<BrowserReviewKind, "code">,
	title: string,
	content: string,
	subtitle?: string,
): BrowserReviewSource {
	return {
		kind,
		title,
		subtitle,
		lines: content.split(/\r?\n/).map((text) => ({ text, style: "plain" })),
		markdownBlocks: renderMarkdownBlocks(content),
	};
}
