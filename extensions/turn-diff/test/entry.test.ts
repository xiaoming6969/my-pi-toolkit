import assert from "node:assert/strict";
import test from "node:test";
import type { CustomEntry, Theme } from "@earendil-works/pi-coding-agent";
import {
	ENTRY_TYPE,
	formatTurnDiffSummary,
	latestTurnDiff,
	parseTurnDiffEntry,
	renderTurnDiffEntry,
	type TurnDiffEntry,
} from "../entry.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

const sample: TurnDiffEntry = {
	files: [
		{ path: "a.ts", added: 2, removed: 1 },
		{ path: "b.ts", added: 0, removed: 0, omitted: true },
	],
	added: 2,
	removed: 1,
	patch: "diff --git a/a.ts b/a.ts\n",
};

test("formatTurnDiffSummary lists file count and net stats", () => {
	assert.equal(
		formatTurnDiffSummary(sample),
		"本轮修改 2 个文件  +2 −1  · /turn-diff",
	);
	assert.equal(
		formatTurnDiffSummary(undefined),
		"本轮修改 0 个文件  +0 −0  · /turn-diff",
	);
	assert.equal(
		formatTurnDiffSummary({ files: [], added: Number.NaN, removed: Number.NaN, patch: "" }),
		"本轮修改 0 个文件  +0 −0  · /turn-diff",
	);
});

test("parseTurnDiffEntry and latestTurnDiff ignore invalid records", () => {
	assert.equal(parseTurnDiffEntry(undefined), undefined);
	assert.equal(parseTurnDiffEntry({ files: [], patch: "" }), undefined);
	assert.equal(
		parseTurnDiffEntry({ files: [{ path: "a.ts" }], patch: "x" }),
		undefined,
	);
	assert.equal(
		parseTurnDiffEntry({ files: [null, { path: "a.ts", added: 1, removed: 0 }], patch: "x" })
			?.files[0]?.path,
		"a.ts",
	);
	const parsed = parseTurnDiffEntry({
		files: [{ path: "a.ts", added: 1, removed: 0, omitted: true }, { path: 1 }],
		added: Number.NaN,
		removed: 4,
		patch: "p",
		tooLarge: true,
	});
	assert.deepEqual(parsed, {
		files: [{ path: "a.ts", added: 1, removed: 0, omitted: true }],
		added: 0,
		removed: 4,
		patch: "p",
		tooLarge: true,
	});
	assert.equal(
		latestTurnDiff([{ type: "custom", customType: "other", data: sample }]),
		undefined,
	);
	assert.equal(
		latestTurnDiff([{ type: "message" }], sample)?.patch,
		sample.patch,
	);
	assert.equal(latestTurnDiff([]), undefined);
});

test("turn-diff renderer expands to per-file stats", () => {
	const entry = { data: sample } as CustomEntry<TurnDiffEntry>;
	const collapsed = renderTurnDiffEntry(entry, { expanded: false }, theme)
		.render(80)
		.join("\n");
	assert.match(collapsed, /本轮修改 2 个文件  \+2 −1  · \/turn-diff/);
	assert.doesNotMatch(collapsed, /a\.ts/);
	const expanded = renderTurnDiffEntry(entry, { expanded: true }, theme)
		.render(80)
		.join("\n");
	assert.match(expanded, /a\.ts  \+2 −1/);
	assert.match(expanded, /b\.ts  omitted/);
	const empty = renderTurnDiffEntry(
		{ data: undefined } as CustomEntry<TurnDiffEntry>,
		{ expanded: true },
		theme,
	)
		.render(80)
		.join("\n");
	assert.match(empty, /本轮修改 0 个文件/);
	assert.doesNotMatch(empty, /omitted/);
});
