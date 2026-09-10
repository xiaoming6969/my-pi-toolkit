import assert from "node:assert/strict";
import test from "node:test";
import { matchSourceIndex } from "../d2h-bind.ts";
import { parseUnifiedDiff } from "../diff-parser.ts";

const lines = parseUnifiedDiff(
	[
		"diff --git a/app.ts b/app.ts",
		"--- a/app.ts",
		"+++ b/app.ts",
		"@@ -1,3 +1,3 @@",
		" keep",
		"-old",
		"+new",
		" tail",
	].join("\n"),
	{ highlight: false },
);

test("matchSourceIndex maps d2h line numbers onto deletion and addition", () => {
	const deletion = matchSourceIndex(lines, "app.ts", "deletion", 2, "old");
	const addition = matchSourceIndex(lines, "app.ts", "addition", 2, "new");
	assert.equal(lines[deletion ?? -1]?.text, "-old");
	assert.equal(lines[addition ?? -1]?.text, "+new");
});

test("matchSourceIndex maps context on both old and new sides", () => {
	assert.equal(lines[matchSourceIndex(lines, "app.ts", "context", 1, "old") ?? -1]?.text, " keep");
	assert.equal(lines[matchSourceIndex(lines, "app.ts", "context", 3, "new") ?? -1]?.text, " tail");
});
