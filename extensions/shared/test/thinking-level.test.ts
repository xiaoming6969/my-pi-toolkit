import assert from "node:assert/strict";
import test from "node:test";
import { thinkingLevelForModel } from "../subagent/thinking-level.ts";

const registry = {
	find(provider: string, modelId: string) {
		if (provider === "cursor" && modelId === "composer-2.5")
			return { reasoning: false };
		if (provider === "openrouter" && modelId === "vendor/reasoner")
			return { reasoning: true };
		return undefined;
	},
};

test("hides inherited thinking for non-reasoning subagent models", () => {
	assert.equal(
		thinkingLevelForModel("cursor/composer-2.5", "medium", registry),
		undefined,
	);
	assert.equal(
		thinkingLevelForModel("openrouter/vendor/reasoner", "high", registry),
		"high",
	);
	assert.equal(thinkingLevelForModel("unknown/model", "low", registry), "low");
	assert.equal(thinkingLevelForModel("cursor/composer-2.5", undefined, registry), undefined);
	assert.equal(thinkingLevelForModel("plain-model", "high", registry), "high");
	assert.equal(thinkingLevelForModel("/leading-slash", "high", registry), "high");
});
