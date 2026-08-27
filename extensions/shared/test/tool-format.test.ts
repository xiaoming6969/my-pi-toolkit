import assert from "node:assert/strict";
import test from "node:test";
import {
	compactText,
	formatCount,
	formatModelWithThinking,
	previewLines,
	resultText,
} from "../tui/tool-format.ts";
import { fitLine, formatDuration } from "../tui/visual-language.ts";

test("compactText and previewLines truncate without keeping extra whitespace", () => {
	assert.equal(compactText("  hello   world  "), "hello world");
	assert.equal(compactText("abcdefghij", 6), "abcde…");
	assert.deepEqual(previewLines("a\nb\nc", 2), { text: "a\nb", truncated: true });
	assert.deepEqual(previewLines("a\nb", 2), { text: "a\nb", truncated: false });
});

test("format helpers describe counts, models, and tool results", () => {
	assert.equal(formatCount(1, "file"), "1 file");
	assert.equal(formatCount(2, "file"), "2 files");
	assert.equal(formatModelWithThinking("gpt"), "gpt");
	assert.equal(formatModelWithThinking("gpt", "high"), "gpt · high");
	assert.equal(resultText([{ type: "text", text: "ok" }], "fallback"), "ok");
	assert.equal(resultText([{ type: "image" }], "fallback"), "fallback");
});

test("formatDuration and fitLine stay within width", () => {
	assert.equal(formatDuration(500), "1s");
	assert.equal(formatDuration(65_000), "1m 05s");
	assert.equal(formatDuration(3_661_000), "1h 01m 01s");
	assert.equal(fitLine("abc", 0), "");
	assert.equal(fitLine("abc", 8).length, 8);
});
