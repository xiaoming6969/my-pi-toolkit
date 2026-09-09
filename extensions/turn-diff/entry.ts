import type {
	CustomEntry,
	EntryRenderOptions,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { mutedLine, secondaryLine } from "../shared/tui/visual-language.js";

export const ENTRY_TYPE = "turn-diff";

export interface TurnDiffFile {
	path: string;
	added: number;
	removed: number;
	omitted?: boolean;
}

export interface TurnDiffEntry {
	files: TurnDiffFile[];
	added: number;
	removed: number;
	patch: string;
	tooLarge?: boolean;
}

export function formatTurnDiffSummary(entry: TurnDiffEntry | undefined): string {
	const files = entry?.files ?? [];
	const added = Number.isFinite(entry?.added) ? Number(entry?.added) : 0;
	const removed = Number.isFinite(entry?.removed) ? Number(entry?.removed) : 0;
	return `本轮修改 ${files.length} 个文件  +${added} −${removed}  · /turn-diff`;
}

export function parseTurnDiffEntry(data: unknown): TurnDiffEntry | undefined {
	if (!data || typeof data !== "object") return undefined;
	const value = data as TurnDiffEntry;
	if (!Array.isArray(value.files) || typeof value.patch !== "string") return undefined;
	const files = value.files.filter(
		(file): file is TurnDiffFile =>
			!!file &&
			typeof file.path === "string" &&
			Number.isFinite(file.added) &&
			Number.isFinite(file.removed),
	);
	if (files.length === 0) return undefined;
	return {
		files,
		added: Number.isFinite(value.added) ? value.added : 0,
		removed: Number.isFinite(value.removed) ? value.removed : 0,
		patch: value.patch,
		tooLarge: value.tooLarge === true,
	};
}

export function latestTurnDiff(
	entries: ReadonlyArray<{ type?: unknown; customType?: unknown; data?: unknown }>,
	fallback?: TurnDiffEntry,
): TurnDiffEntry | undefined {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry?.type !== "custom" || entry.customType !== ENTRY_TYPE) continue;
		const parsed = parseTurnDiffEntry(entry.data);
		if (parsed) return parsed;
	}
	return fallback;
}

export function renderTurnDiffEntry(
	entry: CustomEntry<TurnDiffEntry>,
	options: EntryRenderOptions,
	theme: Theme,
): Text {
	const data = parseTurnDiffEntry(entry.data);
	const lines = [mutedLine(theme, formatTurnDiffSummary(data))];
	if (options.expanded) {
		for (const file of data?.files ?? []) {
			const stats = file.omitted
				? "omitted"
				: `+${file.added} −${file.removed}`;
			lines.push(secondaryLine(theme, `${file.path}  ${stats}`));
		}
	}
	return new Text(lines.join("\n"), 0, 0);
}
