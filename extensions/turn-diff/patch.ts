import { generateUnifiedPatch } from "@earendil-works/pi-coding-agent";

export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_DIFF_BYTES = 5 * 1024 * 1024;
const CONTEXT_LINES = 4;

function splitLines(text: string): string[] {
	if (text === "") return [];
	const lines = text.split(/\r?\n/);
	if (lines.at(-1) === "") lines.pop();
	return lines;
}

export function omittedPatch(path: string, reason: string): string {
	return `diff --git a/${path} b/${path}\n[${reason}]`;
}

export function gitUnifiedPatch(
	path: string,
	oldContent: string,
	newContent: string,
): string {
	if (oldContent === newContent) return "";
	const oldLines = splitLines(oldContent);
	const newLines = splitLines(newContent);
	if (oldLines.length === 0) {
		return [
			`diff --git a/${path} b/${path}`,
			"new file mode 100644",
			"--- /dev/null",
			`+++ b/${path}`,
			`@@ -0,0 +1,${newLines.length} @@`,
			...newLines.map((line) => `+${line}`),
		].join("\n");
	}
	if (newLines.length === 0) {
		return [
			`diff --git a/${path} b/${path}`,
			"deleted file mode 100644",
			`--- a/${path}`,
			"+++ /dev/null",
			`@@ -1,${oldLines.length} +0,0 @@`,
			...oldLines.map((line) => `-${line}`),
		].join("\n");
	}
	return wrapGitHeaders(
		path,
		generateUnifiedPatch(path, oldContent, newContent, CONTEXT_LINES),
	);
}

function wrapGitHeaders(path: string, raw: string): string {
	const lines = raw.split("\n");
	let start = 0;
	if (lines[0]?.startsWith("--- ")) start += 1;
	if (lines[start]?.startsWith("+++ ")) start += 1;
	const rest = lines.slice(start);
	while (rest.at(-1) === "") rest.pop();
	return [
		`diff --git a/${path} b/${path}`,
		`--- a/${path}`,
		`+++ b/${path}`,
		...rest,
	].join("\n");
}

export function countPatchStats(patch: string): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const line of patch.split("\n")) {
		if (line.startsWith("+++") || line.startsWith("---")) continue;
		if (line.startsWith("+")) added += 1;
		else if (line.startsWith("-")) removed += 1;
	}
	return { added, removed };
}
