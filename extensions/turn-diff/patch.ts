export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_DIFF_BYTES = 5 * 1024 * 1024;
const CONTEXT_LINES = 4;

export function splitLines(text: string): string[] {
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
	let prefix = 0;
	while (
		prefix < oldLines.length &&
		prefix < newLines.length &&
		oldLines[prefix] === newLines[prefix]
	) {
		prefix += 1;
	}
	let suffix = 0;
	while (
		suffix < oldLines.length - prefix &&
		suffix < newLines.length - prefix &&
		oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
	) {
		suffix += 1;
	}
	const before = Math.min(CONTEXT_LINES, prefix);
	const after = Math.min(CONTEXT_LINES, suffix);
	const oldStart = prefix - before;
	const newStart = prefix - before;
	const oldSlice = oldLines.slice(oldStart, oldLines.length - suffix + after);
	const newSlice = newLines.slice(newStart, newLines.length - suffix + after);
	const body: string[] = [
		...oldLines.slice(oldStart, prefix).map((line) => ` ${line}`),
		...oldLines.slice(prefix, oldLines.length - suffix).map((line) => `-${line}`),
		...newLines.slice(prefix, newLines.length - suffix).map((line) => `+${line}`),
		...oldLines
			.slice(oldLines.length - suffix, oldLines.length - suffix + after)
			.map((line) => ` ${line}`),
	];
	return [
		`diff --git a/${path} b/${path}`,
		`--- a/${path}`,
		`+++ b/${path}`,
		`@@ -${oldStart + 1},${oldSlice.length} +${newStart + 1},${newSlice.length} @@`,
		...body,
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
