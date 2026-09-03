import assert from "node:assert/strict";
import test from "node:test";
import { resolveSubagentTools } from "../subagent/capability.ts";

test("fixed capability modes map to exact base tool sets", () => {
	assert.deepEqual(resolveSubagentTools({ capability: "read-only" }), [
		"read",
		"grep",
		"find",
		"ls",
	]);
	assert.deepEqual(resolveSubagentTools({ capability: "read-write" }), [
		"read",
		"grep",
		"find",
		"ls",
		"edit",
		"write",
	]);
	assert.deepEqual(resolveSubagentTools({ capability: "execute" }), [
		"read",
		"grep",
		"find",
		"ls",
		"bash",
	]);
});

test("extra tools are appended after the base set without duplicates", () => {
	assert.deepEqual(
		resolveSubagentTools({
			capability: "read-only",
			extraTools: ["symbol_search", "read", "symbol_search"],
		}),
		["read", "grep", "find", "ls", "symbol_search"],
	);
});

test("all uses the parent snapshot and strips parent control tools", () => {
	assert.deepEqual(
		resolveSubagentTools({
			capability: "all",
			availableTools: ["bash", "repo_search", "edit", "subagent_followup"],
		}),
		["bash", "edit"],
	);
	assert.throws(
		() => resolveSubagentTools({ capability: "all" }),
		/工具快照/,
	);
});

test("parent control tools are never allowlisted through extra tools", () => {
	assert.deepEqual(
		resolveSubagentTools({
			capability: "read-only",
			extraTools: ["repo_search"],
		}),
		["read", "grep", "find", "ls"],
	);
});
