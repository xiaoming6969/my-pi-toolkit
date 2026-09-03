import assert from "node:assert/strict";
import test from "node:test";
import {
	resolveRootCauseModel,
	resolveRootCauseThinkingLevel,
} from "../git/root-cause-model.ts";
import type { TapdConfig } from "../types.ts";

const config = (rootCause?: Record<string, unknown>) =>
	({ rootCause }) as unknown as TapdConfig;
const current = { provider: "openai", id: "gpt" };

test("root-cause model prefers tapd.json, then the current model", () => {
	assert.equal(
		resolveRootCauseModel(config({ model: " cursor/composer-2.5 " }), current),
		"cursor/composer-2.5",
	);
	assert.equal(resolveRootCauseModel(config(), current), "openai/gpt");
	assert.throws(
		() => resolveRootCauseModel(config({ model: "  " }), current),
		/非空模型名称/,
	);
	assert.throws(
		() => resolveRootCauseModel(config({ model: 3 }), current),
		/非空模型名称/,
	);
	assert.throws(() => resolveRootCauseModel(config(), undefined), /没有可继承的模型/);
});

test("root-cause thinking level validates configured values", () => {
	assert.equal(resolveRootCauseThinkingLevel(config(), "high"), "high");
	assert.equal(
		resolveRootCauseThinkingLevel(config({ thinkingLevel: "low" }), "high"),
		"low",
	);
	assert.throws(
		() => resolveRootCauseThinkingLevel(config({ thinkingLevel: "ultra" }), "high"),
		/必须是 off、minimal/,
	);
	assert.throws(
		() => resolveRootCauseThinkingLevel(config({ thinkingLevel: 1 }), "high"),
		/thinkingLevel/,
	);
});
