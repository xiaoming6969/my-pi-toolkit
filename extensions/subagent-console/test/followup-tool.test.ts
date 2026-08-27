import assert from "node:assert/strict";
import test from "node:test";
import {
	registerLiveSubagent,
	removeLiveSubagent,
	type LiveSubagentRun,
} from "../../shared/subagent/registry.ts";
import { registerSubagentFollowupTool, resolveFollowupRun } from "../followup-tool.ts";
import {
	createFakeContext,
	createFakePi,
} from "../../shared/test/fake-extension.ts";

function fakeRun(overrides: Partial<LiveSubagentRun> = {}): LiveSubagentRun {
	return {
		id: "followup-agent",
		title: "test",
		model: "test/model",
		cwd: process.cwd(),
		status: "completed",
		startedAt: new Date().toISOString(),
		parentSessionId: "parent-1",
		reusable: true,
		turnCount: 1,
		lines: [],
		entries: [],
		request: async () => {
			throw new Error("unused");
		},
		abort() {},
		dispose() {},
		subscribe: () => () => {},
		...overrides,
	};
}

test("resolves only an exact reusable child from the current parent session", () => {
	const run = fakeRun();
	registerLiveSubagent(run);
	try {
		assert.equal(resolveFollowupRun(run.id, "parent-1"), run);
		assert.throws(
			() => resolveFollowupRun(run.id, "parent-2"),
			/其他主会话/,
		);
		assert.throws(
			() => resolveFollowupRun("   ", "parent-1"),
			/不能为空/,
		);
		assert.throws(
			() => resolveFollowupRun("missing", "parent-1"),
			/未找到/,
		);
	} finally {
		removeLiveSubagent(run.id);
	}
});

test("rejects a live child explicitly configured as one-shot", () => {
	const run = fakeRun({ id: "one-shot-agent", reusable: false });
	registerLiveSubagent(run);
	try {
		assert.throws(
			() => resolveFollowupRun(run.id, "parent-1"),
			/一次性模式/,
		);
	} finally {
		removeLiveSubagent(run.id);
	}
});

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

test("subagent_followup executes, truncates large output, and renders states", async () => {
	const run = fakeRun({
		thinkingLevel: "low",
		request: async (_task, options) => {
			options?.onUpdate?.({
				status: "running",
				toolCalls: [{ name: "read", arguments: { path: "a.ts" } }],
				subagentId: "followup-agent",
				reusable: true,
				turn: 2,
			});
			return {
				output: `${"x".repeat(60 * 1024)}\nline-2`,
				model: "test/model-2",
				toolCalls: [{ name: "read", arguments: { path: "a.ts" } }],
				runDir: "/tmp/run",
				subagentId: "followup-agent",
				reusable: true,
				turn: 2,
			};
		},
	});
	registerLiveSubagent(run);
	try {
		const { pi, tools } = createFakePi();
		registerSubagentFollowupTool(pi);
		const tool = tools.get("subagent_followup") as {
			execute: (
				...args: unknown[]
			) => Promise<{ details?: { truncated?: boolean; status?: string } }>;
			renderCall: (
				args: unknown,
				theme: unknown,
			) => { render: (width: number) => string[] };
			renderResult: (
				result: unknown,
				options: { expanded: boolean },
				theme: unknown,
				context: { isError: boolean },
			) => { render: (width: number) => string[] };
		};
		const ctx = createFakeContext();
		(ctx.sessionManager as { getSessionId: () => string }).getSessionId = () =>
			"parent-1";
		await assert.rejects(
			() =>
				tool.execute(
					"id",
					{ subagentId: run.id, task: "   " },
					undefined,
					undefined,
					ctx,
				),
			/不能为空/,
		);
		const updates: unknown[] = [];
		const result = await tool.execute(
			"id",
			{ subagentId: run.id, task: "continue" },
			undefined,
			(partial: unknown) => updates.push(partial),
			ctx,
		);
		assert.equal(result.details?.status, "completed");
		assert.equal(result.details?.truncated, true);
		assert.equal(updates.length, 1);
		run.request = async () => ({
			output: "short",
			model: run.model,
			toolCalls: [],
			runDir: "/tmp/run",
			subagentId: run.id,
			reusable: true,
			turn: 3,
		});
		const short = await tool.execute(
			"id",
			{ subagentId: run.id, task: "again" },
			undefined,
			undefined,
			ctx,
		);
		assert.equal(short.details?.truncated, false);
		tool.renderCall({}, theme).render(80);
		tool.renderCall({ subagentId: run.id, task: "continue" }, theme).render(80);
		tool
			.renderResult(result, { expanded: true }, theme, { isError: false })
			.render(80);
		tool
			.renderResult(result, { expanded: false }, theme, { isError: false })
			.render(80);
		tool
			.renderResult(
				{
					content: [{ type: "text", text: "partial" }],
					details: {
						running: true,
						status: "running",
						subagentId: run.id,
						title: run.title,
						model: run.model,
						turn: 1,
						reusable: true,
						toolCalls: [{ name: "grep", arguments: { pattern: "x" } }],
					},
				},
				{ expanded: false },
				theme,
				{ isError: false },
			)
			.render(80);
		tool
			.renderResult(
				{ content: [{ type: "text", text: "failed" }] },
				{ expanded: true },
				theme,
				{ isError: true },
			)
			.render(80);
	} finally {
		removeLiveSubagent(run.id);
	}
});
