import assert from "node:assert/strict";
import test from "node:test";
import { registerRepoSearchCommand } from "../command.ts";
import { createFakeContext, createFakePi } from "../../shared/test/fake-extension.ts";

test("registerRepoSearchCommand requires a task and an idle agent", () => {
	const { pi, commands, userMessages } = createFakePi();
	registerRepoSearchCommand(pi);
	const handler = commands.get("repo-search")?.handler;
	assert.ok(handler);
	const ctx = createFakeContext();
	handler("", ctx);
	assert.match(ctx.notifies[0]?.message ?? "", /用法/);
	handler("find X", createFakeContext({ isIdle: false }));
	handler("find X", ctx);
	assert.match(String(userMessages[0]), /find X/);
});
