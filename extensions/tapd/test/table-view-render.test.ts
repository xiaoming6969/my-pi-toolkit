import test from "node:test";
import assert from "node:assert/strict";
import type { KeybindingsManager } from "@earendil-works/pi-tui";
import {
	decodeTableAction,
	typeViewport,
} from "../todo/table-view-render.ts";

function keybindings(): KeybindingsManager {
	return {
		matches(data: string, id: string) {
			if (id === "tui.select.confirm") return data === "\r";
			if (id === "tui.select.cancel") return data === "\x1b";
			return false;
		},
		getKeys: () => [],
	} as unknown as KeybindingsManager;
}

test("decodeTableAction maps shortcuts by kind", () => {
	const keys = keybindings();
	assert.equal(decodeTableAction("\x03", "story", keys), "exit");
	assert.equal(decodeTableAction("\x1b", "story", keys), "cancel");
	assert.equal(decodeTableAction("\t", "story", keys), "kind_toggle");
	assert.equal(decodeTableAction("/", "story", keys), "search");
	assert.equal(decodeTableAction("i", "bug", keys), "scope_toggle");
	assert.equal(decodeTableAction("t", "story", keys), "type_filter");
	assert.equal(decodeTableAction("t", "bug", keys), null);
	assert.equal(decodeTableAction("\r", "story", keys), "confirm");
	assert.equal(decodeTableAction("o", "story", keys), "open");
	assert.equal(decodeTableAction("x", "story", keys), null);
});

test("typeViewport clamps overlay body height", () => {
	assert.equal(typeViewport(1), 3);
	assert.equal(typeViewport(100), 14);
});
