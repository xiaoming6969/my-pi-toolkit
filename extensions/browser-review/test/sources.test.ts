import test from "node:test";
import assert from "node:assert/strict";
import { codeReviewSource, textReviewSource } from "../sources.ts";

test("codeReviewSource parses git unified diffs", () => {
	const source = codeReviewSource(
		"TURN DIFF",
		[
			"diff --git a/src/a.ts b/src/a.ts",
			"--- a/src/a.ts",
			"+++ b/src/a.ts",
			"@@ -1 +1 @@",
			"-old",
			"+new",
		].join("\n"),
		"3 files",
	);
	assert.equal(source.kind, "code");
	assert.equal(source.title, "TURN DIFF");
	assert.equal(source.subtitle, "3 files");
	assert.equal(source.lines[0]?.style, "file");
	assert.equal(source.lines[0]?.file, "src/a.ts");
	assert.equal(source.lines.at(-1)?.style, "addition");
	assert.equal(source.lines.at(-1)?.text, "+new");
});

test("textReviewSource splits lines and attaches markdown blocks", async () => {
	const source = await textReviewSource("document", "DOC", "hello\nworld", "path.md");
	assert.equal(source.kind, "document");
	assert.equal(source.title, "DOC");
	assert.equal(source.subtitle, "path.md");
	assert.deepEqual(
		source.lines.map((line) => line.text),
		["hello", "world"],
	);
	assert.equal(source.lines[0]?.style, "plain");
	assert.ok((source.markdownBlocks?.length ?? 0) > 0);
});
