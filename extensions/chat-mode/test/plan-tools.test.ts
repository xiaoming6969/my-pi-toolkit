import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { BrowserReviewManager } from "../../browser-review/server.ts";
import { registerPlanTools } from "../plan-tools.ts";
import {
	ENTER_PLAN_TOOL,
	EXIT_PLAN_TOOL,
	sessionPlanFile,
} from "../plan-file.ts";
import { setChatMode } from "../state.ts";
import {
	createFakeContext,
	createFakePi,
} from "../../shared/test/fake-extension.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as { fg: (color: string, text: string) => string; bold: (text: string) => string };

async function executeTool(
	tools: Map<string, Record<string, unknown>>,
	name: string,
	ctx: ReturnType<typeof createFakeContext>,
) {
	const tool = tools.get(name) as {
		execute: (...args: unknown[]) => Promise<{ details?: { outcome?: string } }>;
		renderCall: (args: unknown, theme: unknown) => { render: (width: number) => string[] };
		renderResult: (
			result: unknown,
			options: { expanded: boolean },
			theme: unknown,
		) => { render: (width: number) => string[] };
	};
	const result = await tool.execute("id", {}, undefined, undefined, ctx);
	tool.renderCall({}, theme).render(80);
	tool.renderResult(result, { expanded: true }, theme).render(80);
	tool.renderResult(result, { expanded: false }, theme).render(80);
	return result;
}

test("enter_plan_mode and exit_plan_mode cover already-active, declined, and approval paths", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "plan-tools-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const plan = sessionPlanFile(dir, "session-1");
	await mkdir(join(dir, "session-1"), { recursive: true });
	await writeFile(plan.absolutePath, "# Plan\n");

	const { pi, tools } = createFakePi();
	let mode = "build";
	const switched: string[] = [];
	let kickoff = 0;
	registerPlanTools(
		pi,
		{
			getMode: () => mode as "build" | "plan",
			getPlan: () => (mode === "plan" ? plan : undefined),
			enterPlan: async () => {
				mode = "plan";
				return { plan, seed: "nonempty" as const };
			},
			switchMode: (next: string) => {
				mode = next;
				switched.push(next);
			},
			markImplementationKickoff: () => {
				kickoff += 1;
			},
			isBrowserReviewEnabled: () => false,
		},
		{ open: async () => ({ status: "closed" }) } as BrowserReviewManager,
	);

	setChatMode("build");
	mode = "plan";
	assert.equal(
		(await executeTool(tools, ENTER_PLAN_TOOL, createFakeContext())).details
			?.outcome,
		"already_active",
	);

	mode = "build";
	assert.equal(
		(await executeTool(tools, ENTER_PLAN_TOOL, createFakeContext())).details
			?.outcome,
		"entered",
	);

	mode = "build";
	const declinedCtx = createFakeContext({ hasUI: true });
	(declinedCtx.ui as { confirm: () => Promise<boolean> }).confirm = async () =>
		false;
	assert.equal(
		(await executeTool(tools, ENTER_PLAN_TOOL, declinedCtx)).details?.outcome,
		"declined",
	);

	mode = "build";
	assert.equal(
		(await executeTool(tools, EXIT_PLAN_TOOL, createFakeContext())).details
			?.outcome,
		"not_in_plan",
	);

	mode = "plan";
	assert.equal(
		(await executeTool(tools, EXIT_PLAN_TOOL, createFakeContext())).details
			?.outcome,
		"approved_implement",
	);
	assert.equal(kickoff, 1);
	assert.deepEqual(switched, ["build"]);
	setChatMode("build");
});

test("exit_plan_mode covers missing plan and browser review decisions", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "plan-tools-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const plan = sessionPlanFile(dir, "session-2");
	await mkdir(join(dir, "session-2"), { recursive: true });
	await writeFile(plan.absolutePath, "");

	const { pi, tools } = createFakePi();
	let mode: "build" | "plan" = "plan";
	let browserStatus: string = "closed";
	registerPlanTools(
		pi,
		{
			getMode: () => mode,
			getPlan: () => (mode === "plan" && browserStatus === "missing" ? undefined : plan),
			enterPlan: async () => {
				mode = "plan";
				return { plan, seed: "empty" as const };
			},
			switchMode: (next) => {
				mode = next as "build" | "plan";
			},
			markImplementationKickoff: () => {},
			isBrowserReviewEnabled: () => browserStatus !== "terminal",
		},
		{
			open: async () => ({
				status: browserStatus,
				annotations: [],
				feedback: browserStatus === "feedback" ? "nits" : undefined,
				error: "offline",
			}),
		} as BrowserReviewManager,
	);

	mode = "plan";
	browserStatus = "missing";
	assert.equal(
		(await executeTool(tools, EXIT_PLAN_TOOL, createFakeContext({ hasUI: true })))
			.details?.outcome,
		"missing_plan",
	);
	assert.equal(
		(await executeTool(tools, ENTER_PLAN_TOOL, createFakeContext())).details
			?.outcome,
		"already_active",
	);

	browserStatus = "closed";
	assert.equal(
		(await executeTool(tools, EXIT_PLAN_TOOL, createFakeContext({ hasUI: true })))
			.details?.outcome,
		"review_closed",
	);

	browserStatus = "feedback";
	assert.equal(
		(await executeTool(tools, EXIT_PLAN_TOOL, createFakeContext({ hasUI: true })))
			.details?.outcome,
		"revise",
	);

	browserStatus = "abandoned";
	mode = "plan";
	assert.equal(
		(await executeTool(tools, EXIT_PLAN_TOOL, createFakeContext({ hasUI: true })))
			.details?.outcome,
		"abandoned",
	);

	browserStatus = "deferred";
	mode = "plan";
	assert.equal(
		(await executeTool(tools, EXIT_PLAN_TOOL, createFakeContext({ hasUI: true })))
			.details?.outcome,
		"approved_deferred",
	);

	browserStatus = "unavailable";
	mode = "plan";
	const deferCtx = createFakeContext({ hasUI: true });
	(deferCtx.ui as { select: () => Promise<string> }).select = async () =>
		"批准但暂不实现";
	assert.equal(
		(await executeTool(tools, EXIT_PLAN_TOOL, deferCtx)).details?.outcome,
		"approved_deferred",
	);

	mode = "build";
	assert.equal(
		(await executeTool(tools, ENTER_PLAN_TOOL, createFakeContext())).details
			?.outcome,
		"entered",
	);

	const enterTool = tools.get(ENTER_PLAN_TOOL) as {
		renderResult: (
			result: unknown,
			options: { expanded: boolean },
			theme: unknown,
		) => { render: (width: number) => string[] };
	};
	enterTool
		.renderResult(
			{ details: { outcome: "mystery" }, content: [{ type: "image" }] },
			{ expanded: true },
			theme,
		)
		.render(80);
	setChatMode("build");
});
