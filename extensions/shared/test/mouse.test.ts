import test from "node:test";
import assert from "node:assert/strict";
import type { TUI } from "@earendil-works/pi-tui";
import {
	acquireMouseTracking,
	mouseWheelDirection,
	overlayWheelSupported,
} from "../tui/mouse.ts";

test("mouseWheelDirection reads SGR wheel buttons", () => {
	assert.equal(mouseWheelDirection("\x1b[<64;5;6M"), -1);
	assert.equal(mouseWheelDirection("\x1b[<65;5;6m"), 1);
	assert.equal(mouseWheelDirection("\x1b[<0;5;6M"), undefined);
	assert.equal(mouseWheelDirection("hello"), undefined);
});

test("overlayWheelSupported is limited to regular mode", () => {
	assert.equal(overlayWheelSupported({ mode: "regular" } as TUI), true);
	assert.equal(overlayWheelSupported({ mode: "fullscreen" } as TUI), false);
});

test("acquireMouseTracking is reference counted in regular mode", () => {
	const writes: string[] = [];
	const tui = {
		mode: "regular",
		terminal: {
			write(chunk: string) {
				writes.push(chunk);
			},
		},
	} as unknown as TUI;
	const first = acquireMouseTracking(tui);
	const second = acquireMouseTracking(tui);
	assert.deepEqual(writes, ["\x1b[?1000h\x1b[?1006h"]);
	first();
	assert.equal(writes.length, 1);
	second();
	assert.deepEqual(writes.at(-1), "\x1b[?1006l\x1b[?1000l");
	first();
	assert.equal(writes.length, 2);
});

test("acquireMouseTracking is a no-op in fullscreen", () => {
	const writes: string[] = [];
	const tui = {
		mode: "fullscreen",
		terminal: {
			write(chunk: string) {
				writes.push(chunk);
			},
		},
	} as unknown as TUI;
	const release = acquireMouseTracking(tui);
	release();
	assert.deepEqual(writes, []);
});
