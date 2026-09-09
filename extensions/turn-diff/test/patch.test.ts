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

test("omittedPatch is a git file header with a notice", () => {
	const patch = omittedPatch("huge.bin", "binary file omitted");
	assert.equal(
		patch,
		"diff --git a/huge.bin b/huge.bin\n[binary file omitted]",
	);
	assert.equal(parseUnifiedDiff(patch)[0]?.file, "huge.bin");
	assert.deepEqual(countPatchStats(patch), { added: 0, removed: 0 });
});
