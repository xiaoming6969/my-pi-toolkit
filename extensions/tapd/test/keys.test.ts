import assert from "node:assert/strict";
import test from "node:test";
import { linkKey, parseItemKey } from "../sessions/keys.ts";

test("linkKey encodes kind, workspace, and item id", () => {
	assert.equal(linkKey("ws", "100", "bug"), "bug_ws_100");
	assert.equal(linkKey("ws", "100"), "story_ws_100");
});

test("parseItemKey reads current and legacy keys", () => {
	assert.deepEqual(parseItemKey("bug_ws_100"), {
		kind: "bug",
		wsId: "ws",
		itemId: "100",
	});
	assert.deepEqual(parseItemKey("story_ws_100_extra"), {
		kind: "story",
		wsId: "ws",
		itemId: "100_extra",
	});
	assert.deepEqual(parseItemKey("ws_legacy"), {
		kind: "story",
		wsId: "ws",
		itemId: "legacy",
	});
});
