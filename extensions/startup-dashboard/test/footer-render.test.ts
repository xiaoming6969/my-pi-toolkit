import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { createFooterSnapshot, renderFooter } from "../footer.ts";
import { createFakeContext } from "../../shared/test/fake-extension.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

test("renderFooter returns no lines for empty width", () => {
	assert.deepEqual(
		renderFooter(0, createFooterSnapshot(createFakeContext()), theme),
		[],
	);
});

test("renderFooter emits identity and usage on a wide terminal", () => {
	const ctx = createFakeContext({ cwd: "/tmp/demo-repo" });
	(ctx as { model: { provider: string; id: string; contextWindow: number } }).model = {
		provider: "openai",
		id: "gpt",
		contextWindow: 8_000,
	};
	const snapshot = createFooterSnapshot(
		{
			...ctx,
			getContextUsage: () => ({ tokens: 7_200, contextWindow: 8_000, percent: 90 }),
			sessionManager: {
				getEntries: () => [
					{
						type: "message",
						message: {
							role: "assistant",
							usage: { input: 1200, output: 80, cacheRead: 10, cacheWrite: 4, cost: { total: 1.25 } },
						},
					},
				],
			},
		} as never,
		"main",
		"task",
		new Map([["tokenSpeed", "⚡ TPS: 25 tok/s"]]),
	);
	const wide = renderFooter(120, snapshot, theme).join("\n");
	assert.match(wide, /demo-repo/);
	assert.match(wide, /main/);
	assert.match(wide, /\$1\.25/);
	const narrow = renderFooter(40, snapshot, theme).join("\n");
	assert.match(narrow, /ctx/);
	const compact = renderFooter(30, snapshot, theme).join("\n");
	assert.match(compact, /demo-repo|ctx|\$1/);
	const mid = renderFooter(60, snapshot, theme).join("\n");
	assert.ok(mid.length > 0);
});

test("renderFooter covers provider-only, usage-only, and extension status lines", () => {
	const providerOnly = renderFooter(
		120,
		{
			project: undefined,
			branch: undefined,
			title: undefined,
			provider: "openai",
			model: undefined,
			thinking: undefined,
			subagentStatus: undefined,
			modeStatus: "ASK",
			contextTokens: 500,
			contextWindow: undefined,
			contextPercent: 95,
			usage: { cacheWrite: 20 },
			extensionStatuses: [{ id: "tps", glyph: "active", tone: "success", text: "fast" }],
		} as never,
		theme,
	).join("\n");
	assert.match(providerOnly, /openai/);
	assert.match(providerOnly, /fast/);

	const modelOnly = renderFooter(
		80,
		{
			project: "repo",
			branch: "main",
			title: "task",
			provider: undefined,
			model: "gpt",
			thinking: "high",
			subagentStatus: undefined,
			contextTokens: undefined,
			contextWindow: 8_000,
			contextPercent: 75,
			usage: { input: 12_000, output: 2_000_000 },
			extensionStatuses: [],
		} as never,
		theme,
	).join("\n");
	assert.match(modelOnly, /gpt/);
});
