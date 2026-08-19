import assert from "node:assert/strict";
import test from "node:test";
import { isRestrictedMode, nextChatMode } from "./state.ts";

test("Debug follows Ask and remains a full-tool mode", () => {
	assert.equal(nextChatMode("build"), "plan");
	assert.equal(nextChatMode("plan"), "ask");
	assert.equal(nextChatMode("ask"), "debug");
	assert.equal(nextChatMode("debug"), "build");
	assert.equal(isRestrictedMode("debug"), false);
});
