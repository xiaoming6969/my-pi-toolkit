import { highlightDiffLine } from "./syntax-highlight.js";
import type { ReviewLine } from "./types.js";

function parseFile(line: string): string | undefined {
	if (line.startsWith("+++ b/")) return line.slice(6);
	if (!line.startsWith("diff --git ")) return undefined;
	return line.match(/ b\/(.+)$/)?.[1];
}

export function parseUnifiedDiff(
	patch: string,
	options: { highlight?: boolean } = {},
): ReviewLine[] {
	const withHtml = options.highlight !== false;
	let file: string | undefined;
	let oldLine: number | undefined;
	let newLine: number | undefined;
	return patch.split(/\r?\n/).map((text): ReviewLine => {
		file = parseFile(text) ?? file;
		if (text.startsWith("diff --git ")) {
			oldLine = undefined;
			newLine = undefined;
			return { text, style: "file", file };
		}
		const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
		if (hunk) {
			oldLine = Number(hunk[1]);
			newLine = Number(hunk[2]);
			return { text, style: "hunk", file };
		}
		if (text.startsWith("+") && !text.startsWith("+++")) {
			const line: ReviewLine = {
				text,
				style: "addition",
				file,
				newLine,
			};
			if (withHtml) line.html = highlightDiffLine(text, file);
			if (newLine !== undefined) newLine++;
			return line;
		}
		if (text.startsWith("-") && !text.startsWith("---")) {
			const line: ReviewLine = {
				text,
				style: "deletion",
				file,
				oldLine,
			};
			if (withHtml) line.html = highlightDiffLine(text, file);
			if (oldLine !== undefined) oldLine++;
			return line;
		}
		if (text.startsWith(" ")) {
			const line: ReviewLine = {
				text,
				style: "context",
				file,
				oldLine,
				newLine,
			};
			if (withHtml) line.html = highlightDiffLine(text, file);
			if (oldLine !== undefined) oldLine++;
			if (newLine !== undefined) newLine++;
			return line;
		}
		return { text, style: "plain", file };
	});
}
