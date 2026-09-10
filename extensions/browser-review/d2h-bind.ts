import type { ReviewLine } from "./types.js";

export type DiffLineKind = "context" | "addition" | "deletion";
export type DiffLineSide = "old" | "new";

export function matchSourceIndex(
	lines: ReviewLine[],
	file: string,
	kind: DiffLineKind,
	lineNo: number,
	side: DiffLineSide,
): number | undefined {
	const index = lines.findIndex((line) => {
		if (line.file !== file || line.style !== kind) return false;
		return side === "old" ? line.oldLine === lineNo : line.newLine === lineNo;
	});
	return index < 0 ? undefined : index;
}
