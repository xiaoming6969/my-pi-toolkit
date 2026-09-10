import assert from "node:assert/strict";
import test from "node:test";
import { renderDiffHtml } from "../d2h-html.ts";

const patch = [
	"diff --git a/src/a.ts b/src/a.ts",
	"--- a/src/a.ts",
	"+++ b/src/a.ts",
	"@@ -1,3 +1,3 @@",
	" keep",
	"-old",
	"+new",
	" tail",
].join("\n");

test("renderDiffHtml emits side-by-side d2h markup", () => {
	const html = renderDiffHtml(patch, "side-by-side");
	assert.match(html, /d2h-file-wrapper/);
	assert.match(html, /d2h-file-name">src\/a\.ts/);
	assert.match(html, /d2h-file-side-diff/);
	assert.match(html, /<del>old<\/del>/);
	assert.match(html, /<ins>new<\/ins>/);
});

test("renderDiffHtml emits line-by-line d2h markup", () => {
	const html = renderDiffHtml(patch, "line-by-line");
	assert.match(html, /d2h-file-wrapper/);
	assert.doesNotMatch(html, /d2h-file-side-diff/);
	assert.match(html, /d2h-ins/);
	assert.match(html, /d2h-del/);
});

test("omitted placeholder patch falls back to pre", () => {
	const html = renderDiffHtml(
		"diff --git a/huge.bin b/huge.bin\n[binary file omitted]",
		"side-by-side",
	);
	assert.match(html, /d2h-fallback/);
	assert.match(html, /data-file="huge.bin"/);
	assert.match(html, /binary file omitted/);
	assert.doesNotMatch(html, /File without changes/);
});

test("empty or unparsed patch uses fallback pre", () => {
	assert.match(renderDiffHtml("", "side-by-side"), /d2h-fallback/);
	assert.match(renderDiffHtml("not a diff", "line-by-line"), /not a diff/);
});
