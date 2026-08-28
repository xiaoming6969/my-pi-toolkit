import test from "node:test";
import assert from "node:assert/strict";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { createFooterSnapshot, validNumber } from "../footer-data.ts";
import { identitySegments, runtimeSegments } from "../footer-runtime.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

test("validNumber keeps finite non-negative numbers", () => {
	assert.equal(validNumber(0), 0);
	assert.equal(validNumber(1.5), 1.5);
	assert.equal(validNumber(-1), undefined);
	assert.equal(validNumber(Number.NaN), undefined);
	assert.equal(validNumber("1"), undefined);
});

test("createFooterSnapshot drops untitled text and sums usage", () => {
	const snapshot = createFooterSnapshot(
		{
			cwd: "/tmp/my-repo",
			model: { provider: "openai", id: "gpt", contextWindow: 8_000 },
			thinkingLevel: "high",
			getContextUsage: () => ({ tokens: 10, contextWindow: 8_000, percent: 1 }),
			sessionManager: {
				getEntries: () => [
					{
						type: "message",
						message: {
							role: "assistant",
							usage: { input: 2, output: 3, cost: { total: 0.4 } },
						},
					},
					{
						type: "compaction",
						usage: { input: 1, cacheRead: 5 },
					},
				],
			},
		} as unknown as ExtensionContext,
		"main",
		"untitled",
		new Map([
			["session-branch", "blocked"],
			["subagent", "sub*1"],
		]),
	);
	assert.equal(snapshot.project, "my-repo");
	assert.equal(snapshot.branch, "main");
	assert.equal(snapshot.title, undefined);
	assert.equal(snapshot.provider, "openai");
	assert.equal(snapshot.model, "gpt");
	assert.equal(snapshot.thinking, "high");
	assert.equal(snapshot.branchMismatch, "blocked");
	assert.equal(snapshot.subagentStatus, "sub*1");
	assert.equal(snapshot.usage.input, 3);
	assert.equal(snapshot.usage.output, 3);
	assert.equal(snapshot.usage.cacheRead, 5);
	assert.equal(snapshot.usage.cost, 0.4);
	assert.equal(snapshot.contextTokens, 10);
	assert.equal(snapshot.contextPercent, 1);
});

test("identity and runtime segments follow snapshot fields", () => {
	const snapshot = createFooterSnapshot(
		{
			cwd: "/tmp/repo",
			model: { provider: "openai", id: "gpt" },
			thinkingLevel: "low",
			getContextUsage: () => undefined,
			sessionManager: { getEntries: () => [] },
		} as unknown as ExtensionContext,
		"main",
		"task",
		new Map([["session-branch", "blocked"]]),
	);
	assert.deepEqual(
		identitySegments(snapshot, theme).map((segment) => segment.id),
		["project", "branch", "branch-status", "title"],
	);
	assert.deepEqual(
		runtimeSegments({ ...snapshot, subagentStatus: "s*1" }, theme).map(
			(segment) => segment.id,
		),
		["model", "thinking", "subagent"],
	);
	assert.deepEqual(
		identitySegments(
			{ ...snapshot, project: undefined, branch: undefined, title: undefined, branchMismatch: undefined, modeStatus: undefined },
			theme,
		),
		[],
	);
	assert.equal(
		runtimeSegments(
			{ ...snapshot, provider: undefined, model: "gpt", thinking: undefined, subagentStatus: undefined },
			theme,
		)[0]?.id,
		"model",
	);
	assert.equal(
		runtimeSegments(
			{ ...snapshot, provider: "openai", model: undefined },
			theme,
			true,
		)[0]?.id,
		"model",
	);

	const advisory = createFooterSnapshot(
		{
			cwd: "/tmp/repo",
			model: { provider: "openai", id: "gpt" },
			thinkingLevel: "low",
			getContextUsage: () => undefined,
			sessionManager: { getEntries: () => [] },
		} as unknown as ExtensionContext,
		"dev",
		"task",
		new Map([["session-branch", "advisory"]]),
	);
	assert.equal(advisory.branchMismatch, "advisory");
	assert.equal(
		identitySegments(advisory, theme).find((segment) => segment.id === "branch-status")
			?.content,
		"branch mismatch",
	);
	assert.equal(
		identitySegments(snapshot, theme).find((segment) => segment.id === "branch-status")
			?.content,
		"✗ branch mismatch",
	);
});
