import assert from "node:assert/strict";
import test from "node:test";
import { IMPLEMENTATION_WORKER_EXTENSIONS } from "../worker-extensions.ts";
import { currentThinkingLevel, researchConfig } from "../model-config.ts";
import { createFakeContext } from "../../shared/test/fake-extension.ts";
import { existsSync } from "node:fs";

test("implementation worker extensions point at the path guard", () => {
	assert.equal(IMPLEMENTATION_WORKER_EXTENSIONS.length, 1);
	assert.equal(existsSync(IMPLEMENTATION_WORKER_EXTENSIONS[0]!), true);
	assert.match(IMPLEMENTATION_WORKER_EXTENSIONS[0]!, /path-guard\.ts$/);
});

test("researchConfig is omitted unless a research task exists", () => {
	const ctx = createFakeContext();
	assert.equal(
		researchConfig({ tasks: [{ id: "1", kind: "implementation", task: "x", paths: [] }] } as never, ctx),
		undefined,
	);
	const config = researchConfig(
		{ tasks: [{ id: "1", kind: "research", task: "find", paths: [] }] } as never,
		ctx,
	);
	assert.ok(config?.model);
	assert.equal(currentThinkingLevel("openai/gpt", ctx), ctx.thinkingLevel);
});
