import test from "node:test";
import assert from "node:assert/strict";
import type { KeybindingsManager } from "@earendil-works/pi-tui";
import {
	decodeConfirmationInput,
	decodeCreateInput,
	decodeListInput,
	navigationTarget,
} from "../todo/session-picker-input.ts";

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

test("navigationTarget moves by arrow, vim, page, and home/end", () => {
	const opts = { current: 5, last: 20, pageSize: 10 };
	assert.equal(navigationTarget("\x1b[A", opts), 4);
	assert.equal(navigationTarget("k", opts), 4);
	assert.equal(navigationTarget("\x1b[B", opts), 6);
	assert.equal(navigationTarget("j", opts), 6);
	assert.equal(navigationTarget("\x1b[5~", opts), 0);
	assert.equal(navigationTarget("\x1b[6~", opts), 15);
	assert.equal(navigationTarget("\x1b[H", opts), 0);
	assert.equal(navigationTarget("\x1b[F", opts), 20);
	assert.equal(navigationTarget("x", opts), null);
	assert.equal(navigationTarget("j", { ...opts, allowVim: false }), null);
});

test("decodeConfirmationInput maps enter, escape, and ctrl+c", () => {
	const keys = keybindings();
	assert.equal(decodeConfirmationInput("\r", keys), "confirm");
	assert.equal(decodeConfirmationInput("\x1b", keys), "cancel");
	assert.equal(decodeConfirmationInput("\x03", keys), "cancel");
	assert.equal(decodeConfirmationInput("x", keys), "none");
});

test("decodeListInput navigates, selects, deletes, and cancels", () => {
	const keys = keybindings();
	assert.deepEqual(decodeListInput("\x1b[B", 0, 3, keys), {
		type: "navigate",
		target: 1,
	});
	assert.deepEqual(decodeListInput("\r", 0, 3, keys), { type: "select" });
	assert.deepEqual(decodeListInput("\x04", 0, 3, keys), { type: "delete" });
	assert.deepEqual(decodeListInput("\x1b", 0, 3, keys), { type: "cancel" });
	assert.deepEqual(decodeListInput("x", 0, 3, keys), { type: "none" });
});

test("decodeCreateInput routes name, path, history, and submit focus", () => {
	const keys = keybindings();
	const base = { historyCount: 1, keybindings: keys };
	assert.deepEqual(decodeCreateInput("\x1b", { ...base, focus: 0 }), {
		type: "cancel",
	});
	assert.deepEqual(decodeCreateInput("a", { ...base, focus: 0 }), {
		type: "input",
		target: "name",
	});
	assert.deepEqual(decodeCreateInput("a", { ...base, focus: 2 }), {
		type: "input",
		target: "path",
	});
	assert.deepEqual(decodeCreateInput(" ", { ...base, focus: 1 }), {
		type: "toggle-path",
		index: 0,
	});
	assert.deepEqual(decodeCreateInput("\x04", { ...base, focus: 1 }), {
		type: "delete-path",
		index: 0,
	});
	assert.deepEqual(decodeCreateInput("\r", { ...base, focus: 3 }), {
		type: "submit",
	});
	assert.deepEqual(decodeCreateInput("\r", { ...base, focus: 1 }), {
		type: "toggle-path",
		index: 0,
	});
});
