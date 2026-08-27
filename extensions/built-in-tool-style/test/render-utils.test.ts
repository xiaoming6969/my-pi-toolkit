import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	BUILTIN_TOOL_NAMES,
	DEFAULT_BUILTIN_TOOL_STYLE,
	READ_ONLY_TOOL_NAMES,
} from "../config.ts";
import {
	colorDiff,
	contentLineCount,
	contentSummary,
	displayPath,
	elapsed,
	errorSummary,
	expansionHint,
	tailLines,
	textContent,
	toolStatus,
	truncationSummary,
} from "../render-utils.ts";

const theme = {
	fg: (color: string, text: string) => `${color}:${text}`,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

test("exported style defaults cover the seven builtin tools", () => {
	assert.equal(DEFAULT_BUILTIN_TOOL_STYLE, "grok");
	assert.deepEqual(BUILTIN_TOOL_NAMES, [
		"read",
		"write",
		"edit",
		"bash",
		"grep",
		"find",
		"ls",
	]);
	assert.deepEqual(READ_ONLY_TOOL_NAMES, ["read", "grep", "find", "ls"]);
});

test("displayPath keeps project-relative paths and falls back to the original", () => {
	const cwd = "/repo";
	assert.equal(displayPath(undefined, cwd), ".");
	assert.equal(displayPath("  ", cwd), ".");
	assert.equal(displayPath(join(cwd, "src", "a.ts"), cwd), join("src", "a.ts"));
	assert.equal(displayPath("src/a.ts", cwd), "src/a.ts");
	assert.equal(displayPath("/elsewhere/a.ts", cwd), "/elsewhere/a.ts");
});

test("tool result helpers summarize content, errors, and truncation", () => {
	assert.equal(
		textContent({
			content: [
				{ type: "text", text: "one" },
				{ type: "image" },
				{ type: "text", text: "two" },
			],
		} as never),
		"one\ntwo",
	);
	assert.equal(toolStatus(true, false), "active");
	assert.equal(toolStatus(false, true), "error");
	assert.equal(toolStatus(false, false), "success");
	assert.equal(contentLineCount(""), 0);
	assert.equal(contentLineCount("a\nb"), 2);
	assert.equal(contentLineCount("a\nb\n"), 2);
	assert.match(contentSummary("a\nb"), /2 lines/);
	assert.equal(errorSummary("\n  boom  \nstack"), "boom");
	assert.equal(errorSummary("   "), "failed");
	assert.equal(expansionHint(true), undefined);
	assert.equal(truncationSummary(undefined), undefined);
	assert.equal(truncationSummary({ truncated: false } as never), undefined);
	assert.match(
		truncationSummary({
			truncated: true,
			outputLines: 2,
			totalLines: 10,
			outputBytes: 8,
			totalBytes: 40,
		} as never) ?? "",
		/truncated: showing 2\/10 lines/,
	);
	assert.equal(tailLines("a\nb\nc\nd", 2), "c\nd");
	assert.equal(elapsed(1_000, 1_200), "200ms");
	assert.equal(elapsed(1_000, 3_500), "2.5s");
});

test("colorDiff paints added and removed lines", () => {
	assert.equal(
		colorDiff("+added\n-removed\n context", theme),
		"toolDiffAdded:+added\ntoolDiffRemoved:-removed\ntoolDiffContext: context",
	);
});
