import assert from "node:assert/strict";
import test from "node:test";
import { registerDebugCommand } from "../debug-command.ts";
import { setChatMode } from "../state.ts";
import { createFakeContext, createFakePi } from "../../shared/test/fake-extension.ts";

test("registerDebugCommand validates args, idle state, and mode", async () => {
	const { pi, commands } = createFakePi();
	const opened: string[] = [];
	const switched: string[] = [];
	registerDebugCommand(
		pi,
		{
			switchMode: (mode: string) => {
				switched.push(mode);
			},
		} as never,
		{
			open: async () => {
				opened.push("open");
			},
		},
	);
	const handler = commands.get("debuglog")?.handler;
	assert.ok(handler);
	const ctx = createFakeContext();
	await handler("extra", ctx);
	assert.match(ctx.notifies[0]?.message ?? "", /用法/);

	const busy = createFakeContext({ isIdle: false });
	await handler("", busy);
	assert.match(busy.notifies[0]?.message ?? "", /请等待/);

	setChatMode("build");
	await handler("", ctx);
	assert.deepEqual(switched, ["debug"]);

	setChatMode("debug");
	await handler("", ctx);
	assert.deepEqual(opened, ["open"]);
	setChatMode("build");
});
