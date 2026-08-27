import assert from "node:assert/strict";
import test from "node:test";
import { parseUnifiedDiff } from "../diff-parser.ts";

test("unified diff lines retain file and old/new positions", () => {
	const lines = parseUnifiedDiff([
		"diff --git a/a.ts b/a.ts",
		"--- a/a.ts",
		"+++ b/a.ts",
		"@@ -2,2 +2,2 @@",
		" const before = 1;",
		"-const old = false;",
		"+const ready = true;",
	].join("\n"));
	const { html, ...context } = lines[4];
	assert.deepEqual(context, {
		text: " const before = 1;",
		style: "context",
		file: "a.ts",
		oldLine: 2,
		newLine: 2,
	});
	assert.match(html, /hljs-keyword/);
	assert.equal(lines[5].text, "-const old = false;");
	assert.match(lines[5].html, /^-<span class="hljs-keyword">const<\/span>/);
	assert.equal(lines[5].oldLine, 3);
	assert.equal(lines[5].newLine, undefined);
	assert.match(lines[6].html, /hljs-literal/);
	assert.equal(lines[6].oldLine, undefined);
	assert.equal(lines[6].newLine, 3);
});

test("unknown diff languages remain escaped plain text", () => {
	const lines = parseUnifiedDiff([
		"diff --git a/a.unknown b/a.unknown",
		"+++ b/a.unknown",
		"@@ -0,0 +1 @@",
		"+<script>alert('xss')</script>",
	].join("\n"));
	assert.equal(
		lines[3].html,
		"+&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;",
	);
});
