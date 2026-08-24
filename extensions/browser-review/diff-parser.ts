import type { ReviewLine } from "./types.js";

function parseFile(line: string): string | undefined {
	if (line.startsWith("+++ b/")) return line.slice(6);
	if (!line.startsWith("diff --git ")) return undefined;
	return line.match(/ b\/(.+)$/)?.[1];
}

export function parseUnifiedDiff(patch: string): ReviewLine[] {
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
			const line = { text, style: "addition" as const, file, newLine };
			if (newLine !== undefined) newLine++;
			return line;
		}
		if (text.startsWith("-") && !text.startsWith("---")) {
			const line = { text, style: "deletion" as const, file, oldLine };
			if (oldLine !== undefined) oldLine++;
			return line;
		}
		if (text.startsWith(" ")) {
			const line = { text, style: "context" as const, file, oldLine, newLine };
			if (oldLine !== undefined) oldLine++;
			if (newLine !== undefined) newLine++;
			return line;
		}
		return { text, style: "plain", file };
	});
}
