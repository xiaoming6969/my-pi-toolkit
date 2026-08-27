import assert from "node:assert/strict";
import test from "node:test";
import { mapRemoteModels } from "../map-model.ts";
import { resolveApiKey } from "../config.ts";

test("mapRemoteModels infers reasoning from id fragments and defaults", () => {
	const mapped = mapRemoteModels(
		[
			{ id: "gpt-5.4", name: "GPT" },
			{ id: "vendor/reasoner", name: "" },
			{ id: "plain-chat" },
		],
		{ contextWindow: 64_000, maxTokens: 2_048 },
	);
	assert.equal(mapped[0]?.reasoning, true);
	assert.equal(mapped[0]?.name, "GPT");
	assert.equal(mapped[1]?.reasoning, true);
	assert.equal(mapped[1]?.name, "vendor/reasoner");
	assert.equal(mapped[2]?.reasoning, false);
	assert.equal(mapped[2]?.contextWindow, 64_000);
	assert.equal(mapped[0]?.contextWindow, 64_000);
});

test("mapRemoteModels honors explicit reasoning and optional maps", () => {
	const mapped = mapRemoteModels([{ id: "gpt-5.4" }], {
		reasoning: false,
		thinkingLevelMap: { medium: "medium" },
		compat: { thinking: true },
	});
	assert.equal(mapped[0]?.reasoning, false);
	assert.deepEqual(mapped[0]?.thinkingLevelMap, { medium: "medium" });
	assert.deepEqual(mapped[0]?.compat, { thinking: true });
});

test("resolveApiKey reads literals and $ENV / ${ENV} placeholders", () => {
	const key = "OPENAI_COMPAT_TEST_KEY";
	const previous = process.env[key];
	try {
		process.env[key] = " secret ";
		assert.equal(resolveApiKey("literal"), "literal");
		assert.equal(resolveApiKey(`$${key}`), "secret");
		assert.equal(resolveApiKey(`\${${key}}`), "secret");
		delete process.env[key];
		assert.equal(resolveApiKey(`$${key}`), undefined);
		assert.equal(resolveApiKey("   "), undefined);
	} finally {
		if (previous === undefined) delete process.env[key];
		else process.env[key] = previous;
	}
});
