import assert from "node:assert/strict";
import test from "node:test";
import { parseUnifiedDiff } from "./diff-parser.ts";

test("unified diff lines retain file and old/new positions", () => {
	const lines = parseUnifiedDiff([
		"diff --git a/a.ts b/a.ts",
		"--- a/a.ts",
		"+++ b/a.ts",
		"@@ -2,2 +2,2 @@",
		" same",
		"-old",
		"+new",
	].join("\n"));
	assert.deepEqual(lines[4], {
		text: " same",
		style: "context",
		file: "a.ts",
		oldLine: 2,
		newLine: 2,
	});
	assert.equal(lines[5].oldLine, 3);
	assert.equal(lines[5].newLine, undefined);
	assert.equal(lines[6].oldLine, undefined);
	assert.equal(lines[6].newLine, 3);
});
