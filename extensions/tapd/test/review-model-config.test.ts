import assert from "node:assert/strict";
import test from "node:test";
import {
	resolveReviewModel,
	resolveReviewThinkingLevel,
} from "../review/model-config.ts";
import type { TapdConfig } from "../types.ts";

const config = (review?: Record<string, unknown>) =>
	({ review }) as unknown as TapdConfig;
const current = { provider: "openai", id: "gpt" };

test("review model prefers tapd.json, then the current model", () => {
	assert.equal(resolveReviewModel(config({ model: " a/b " }), current), "a/b");
	assert.equal(resolveReviewModel(config(), current), "openai/gpt");
	assert.throws(() => resolveReviewModel(config({ model: "  " }), current), /非空模型名称/);
	assert.throws(() => resolveReviewModel(config({ model: 3 }), current), /非空模型名称/);
	assert.throws(() => resolveReviewModel(config(), undefined), /没有可继承的模型/);
});

test("review thinking level validates configured values", () => {
	assert.equal(resolveReviewThinkingLevel(config(), "high"), "high");
	assert.equal(resolveReviewThinkingLevel(config({ thinkingLevel: "low" }), "high"), "low");
	assert.throws(
		() => resolveReviewThinkingLevel(config({ thinkingLevel: "ultra" }), "high"),
		/必须是 off、minimal/,
	);
	assert.throws(
		() => resolveReviewThinkingLevel(config({ thinkingLevel: 1 }), "high"),
		/thinkingLevel/,
	);
});
