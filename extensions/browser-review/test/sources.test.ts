import test from "node:test";
import assert from "node:assert/strict";
import { textReviewSource } from "../sources.ts";

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
