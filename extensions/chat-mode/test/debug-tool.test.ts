import assert from "node:assert/strict";
import test from "node:test";
import { FINISH_DEBUG_TOOL, registerFinishDebugTool } from "../debug-tool.ts";
import { setChatMode } from "../state.ts";
import { createFakeContext, createFakePi } from "../../shared/test/fake-extension.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as { fg: (color: string, text: string) => string; bold: (text: string) => string };

test("finish_debug_cleanup requires debug mode and a collector", async () => {
	const themeResult = (tool: {
		renderCall: (args: unknown, theme: unknown) => { render: (width: number) => string[] };
		renderResult: (
			result: unknown,
			options: { expanded: boolean },
			theme: unknown,
		) => { render: (width: number) => string[] };
	}, result: unknown) => {
		tool.renderCall({}, theme).render(80);
		tool.renderResult(result, { expanded: true }, theme).render(80);
	};

	const { pi, tools } = createFakePi();
	registerFinishDebugTool(pi, {
		getCollector: () => undefined,
		modeController: { switchMode: () => {} } as never,
	});
	const missingTool = tools.get(FINISH_DEBUG_TOOL) as {
		execute: (...args: unknown[]) => Promise<{ details?: { outcome?: string } }>;
		renderCall: (args: unknown, theme: unknown) => { render: (width: number) => string[] };
		renderResult: (
			result: unknown,
			options: { expanded: boolean },
			theme: unknown,
		) => { render: (width: number) => string[] };
	};

	setChatMode("build");
	const notDebug = await missingTool.execute("id", {}, undefined, undefined, createFakeContext());
	assert.equal(notDebug.details?.outcome, "not_in_debug");

	setChatMode("debug");
	const unavailable = await missingTool.execute(
		"id",
		{},
		undefined,
		undefined,
		createFakeContext(),
	);
	assert.equal(unavailable.details?.outcome, "unavailable");

	const switched: string[] = [];
	registerFinishDebugTool(pi, {
		getCollector: () =>
			({
				logPath: "/tmp/debug.jsonl",
				clearAll: async () => {},
				stop: async () => {},
				forgetEndpoint: async () => {},
			}) as never,
		modeController: {
			switchMode: (mode: string) => switched.push(mode),
		} as never,
	});
	const ready = tools.get(FINISH_DEBUG_TOOL) as typeof missingTool;
	const completed = await ready.execute(
		"id",
		{},
		undefined,
		undefined,
		createFakeContext(),
	);
	assert.equal(completed.details?.outcome, "completed");
	assert.deepEqual(switched, ["build"]);
	themeResult(ready, completed);
	ready.renderResult(completed, { expanded: false }, theme).render(80);
	setChatMode("build");
});
