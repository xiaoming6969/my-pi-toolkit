import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isRestrictedMode, nextChatMode } from "../state.ts";

test("Debug follows Ask and remains a full-tool mode", () => {
	assert.equal(nextChatMode("build"), "plan");
	assert.equal(nextChatMode("plan"), "ask");
	assert.equal(nextChatMode("ask"), "debug");
	assert.equal(nextChatMode("debug"), "build");
	assert.equal(isRestrictedMode("debug"), false);
});

test("Build kickoff overrides historical restricted-mode context", () => {
	const prompt = readFileSync(new URL("../prompt.ts", import.meta.url), "utf8");
	assert.match(prompt, /earlier Ask or Plan mode messages are historical/);
	assert.match(prompt, /do not ask the user to switch modes/);
});
