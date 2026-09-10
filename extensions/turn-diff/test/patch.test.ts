import assert from "node:assert/strict";
import test from "node:test";
import { parseUnifiedDiff } from "../../browser-review/diff-parser.ts";
import {
	countPatchStats,
	gitUnifiedPatch,
	omittedPatch,
} from "../patch.ts";

test("gitUnifiedPatch emits parseable new-file and deletion patches", () => {
	const created = gitUnifiedPatch("src/a.ts", "", "export const a = 1;\n");
	assert.match(created, /^diff --git a\/src\/a\.ts b\/src\/a\.ts/m);
	assert.match(created, /--- \/dev\/null/);
	assert.match(created, /\+export const a = 1;/);
	const createdLines = parseUnifiedDiff(created);
	assert.equal(createdLines[0]?.file, "src/a.ts");
	assert.ok(createdLines.some((line) => line.style === "addition"));

	const deleted = gitUnifiedPatch("gone.ts", "old\n", "");
	assert.match(deleted, /deleted file mode/);
	assert.match(deleted, /\-old/);
	assert.ok(parseUnifiedDiff(deleted).some((line) => line.style === "deletion"));
	assert.equal(gitUnifiedPatch("same.ts", "x\n", "x\n"), "");
});

test("gitUnifiedPatch keeps context around an in-place edit", () => {
	const oldContent = ["keep", "old", "tail"].join("\n") + "\n";
	const newContent = ["keep", "new", "tail"].join("\n") + "\n";
	const patch = gitUnifiedPatch("app.ts", oldContent, newContent);
	assert.match(patch, /--- a\/app\.ts/);
	assert.match(patch, /\+\+\+ b\/app\.ts/);
	assert.match(patch, / keep/);
	assert.match(patch, /\-old/);
	assert.match(patch, /\+new/);
	const lines = parseUnifiedDiff(patch);
	assert.equal(lines.find((line) => line.style === "deletion")?.file, "app.ts");
	assert.deepEqual(countPatchStats(patch), { added: 1, removed: 1 });
	assert.deepEqual(countPatchStats("+++ b/a.ts\n--- a/a.ts\n+add\n-sub\n"), {
		added: 1,
		removed: 1,
	});
});

test("gitUnifiedPatch keeps unchanged middle lines as context, not delete-then-add", () => {
	const oldLines = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`);
	const newLines = [...oldLines];
	newLines[4] = "line 5 changed";
	newLines[34] = "line 35 changed";
	const patch = gitUnifiedPatch(
		"index.tsx",
		`${oldLines.join("\n")}\n`,
		`${newLines.join("\n")}\n`,
	);
	assert.match(patch, /^ line 6$/m);
	assert.match(patch, /^ line 34$/m);
	assert.doesNotMatch(patch, /line 20/);
	assert.equal(patch.match(/^@@ /gm)?.length, 2);
	assert.deepEqual(countPatchStats(patch), { added: 2, removed: 2 });
	const parsed = parseUnifiedDiff(patch);
	assert.equal(parsed.filter((line) => line.style === "hunk").length, 2);
	assert.ok(parsed.some((line) => line.style === "context" && line.text === " line 6"));
});

test("gitUnifiedPatch keeps unchanged lines between nearby edits as context", () => {
	const oldLines = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`);
	const newLines = [...oldLines];
	newLines[2] = "line 3 changed";
	newLines[6] = "line 7 changed";
	const patch = gitUnifiedPatch(
		"index.tsx",
		`${oldLines.join("\n")}\n`,
		`${newLines.join("\n")}\n`,
	);
	assert.equal(patch.match(/^@@ /gm)?.length, 1);
	assert.match(patch, /^ line 5$/m);
	assert.doesNotMatch(patch, /^-line 5$/m);
	assert.doesNotMatch(patch, /^\+line 5$/m);
	assert.deepEqual(countPatchStats(patch), { added: 2, removed: 2 });
});

test("omittedPatch is a git file header with a notice", () => {
	const patch = omittedPatch("huge.bin", "binary file omitted");
	assert.equal(
		patch,
		"diff --git a/huge.bin b/huge.bin\n[binary file omitted]",
	);
	assert.equal(parseUnifiedDiff(patch)[0]?.file, "huge.bin");
	assert.deepEqual(countPatchStats(patch), { added: 0, removed: 0 });
});
