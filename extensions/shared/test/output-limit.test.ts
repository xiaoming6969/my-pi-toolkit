import assert from "node:assert/strict";
import test from "node:test";
import { truncateSubagentOutput } from "../subagent/output-limit.ts";

test("short output is returned unchanged", () => {
	assert.deepEqual(truncateSubagentOutput("report", "[cut]"), {
		content: "report",
		truncated: false,
	});
});

test("output over the line cap is truncated and the notice appended", () => {
	const long = Array.from({ length: 2500 }, (_, i) => `line ${i}`).join("\n");
	const result = truncateSubagentOutput(long, "[cut]");
	assert.equal(result.truncated, true);
	assert.ok(result.content.endsWith("\n\n[cut]"));
	assert.ok(result.content.length < long.length);
});

test("output over the byte cap is truncated", () => {
	const result = truncateSubagentOutput("x".repeat(60 * 1024), "[cut]");
	assert.equal(result.truncated, true);
	assert.ok(result.content.endsWith("[cut]"));
});
