import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import multiTaskPathGuard from "../path-guard.ts";

function withAllowedPaths(t: test.TestContext, value: string | undefined) {
	const previous = process.env.PI_MULTI_TASK_ALLOWED_PATHS;
	if (value === undefined) delete process.env.PI_MULTI_TASK_ALLOWED_PATHS;
	else process.env.PI_MULTI_TASK_ALLOWED_PATHS = value;
	t.after(() => {
		if (previous === undefined) delete process.env.PI_MULTI_TASK_ALLOWED_PATHS;
		else process.env.PI_MULTI_TASK_ALLOWED_PATHS = previous;
	});
}

function installGuard() {
	let handler:
		| ((
				event: { toolName: string; input: unknown },
				ctx: ExtensionContext,
		  ) => unknown)
		| undefined;
	multiTaskPathGuard({
		on(event, fn) {
			if (event === "tool_call") handler = fn;
		},
	} as ExtensionAPI);
	assert.ok(handler);
	return handler;
}

test("path guard requires a string array of allowed roots", (t) => {
	withAllowedPaths(t, undefined);
	assert.throws(
		() =>
			multiTaskPathGuard({
				on() {},
			} as ExtensionAPI),
		/缺少允许写入路径配置/,
	);
	withAllowedPaths(t, "{");
	assert.throws(
		() =>
			multiTaskPathGuard({
				on() {},
			} as ExtensionAPI),
		/允许写入路径配置无效/,
	);
	withAllowedPaths(t, JSON.stringify({ path: "/tmp" }));
	assert.throws(
		() =>
			multiTaskPathGuard({
				on() {},
			} as ExtensionAPI),
		/必须是字符串数组/,
	);
});

test("path guard blocks writes outside the declared roots", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "multi-task-guard-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const allowed = join(root, "allowed");
	await mkdir(allowed, { recursive: true });
	await writeFile(join(allowed, "keep.ts"), "x");
	withAllowedPaths(t, JSON.stringify([allowed]));
	const handler = installGuard();
	const ctx = { cwd: root } as ExtensionContext;

	assert.equal(
		handler({ toolName: "read", input: { path: "secret.ts" } }, ctx),
		undefined,
	);
	assert.deepEqual(handler({ toolName: "write", input: {} }, ctx), {
		block: true,
		reason: "Multi Task 写工具必须提供 path",
	});
	assert.equal(
		handler({ toolName: "write", input: { path: join("allowed", "keep.ts") } }, ctx),
		undefined,
	);
	assert.equal(
		handler({ toolName: "edit", input: { path: join(allowed, "new.ts") } }, ctx),
		undefined,
	);
	const blocked = handler(
		{ toolName: "write", input: { path: "outside.ts" } },
		ctx,
	) as { block: boolean; reason: string };
	assert.equal(blocked.block, true);
	assert.match(blocked.reason, /声明范围外的路径/);
});
