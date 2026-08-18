import assert from "node:assert/strict";
import test from "node:test";
import { extensionStatusTexts } from "./footer-status.ts";

test("adapts installed statuses to M-PI segments", () => {
	const statuses = new Map([
		["tokenSpeed", "\u001b[32m⚡ TPS:\t25.0 tok/s (TTFT: 450 ms)\u001b[0m\u200b"],
		["subagent", "subagent*2"],
		["session-branch", "分支不匹配"],
		["ponytail", "\u001b[36m●\u001b[0m 🐴 ponytail: ⚡ FULL"],
		["agent-todos", "📋 1/3"],
	]);

	assert.deepEqual(extensionStatusTexts(statuses), [
		{
			id: "tokenSpeed",
			text: "tps 25.0 tok/s (ttft 450 ms)",
			tone: "warning",
		},
		{
			id: "ponytail",
			text: "ponytail:full",
			tone: "muted",
			glyph: "active",
		},
	]);
});

test("maps TPS tiers to M-PI semantic colors", () => {
	const toneFor = (value) =>
		extensionStatusTexts(new Map([["tokenSpeed", `⚡ TPS: ${value}`]]))[0]?.tone;
	assert.equal(toneFor("10 tok/s"), "error");
	assert.equal(toneFor("25 tok/s"), "warning");
	assert.equal(toneFor("35 tok/s"), "success");
	assert.equal(toneFor("50 tok/s"), "accent");
	assert.equal(toneFor("--"), "muted");
});

test("maps Pi Lens state to compact semantic tones", () => {
	assert.deepEqual(
		extensionStatusTexts(
			new Map([["pi-lens-lsp", "LSP Active: ts · LSP Failed: py"]]),
		),
		[{ id: "pi-lens-lsp", text: "lsp:error", tone: "error" }],
	);
	assert.deepEqual(
		extensionStatusTexts(new Map([["pi-lens-lsp", "LSP Active: ts, marksman"]])),
		[{ id: "pi-lens-lsp", text: "lsp:on", tone: "success" }],
	);
	assert.deepEqual(
		extensionStatusTexts(new Map([["pi-lens-lsp", "LSP Inactive"]])),
		[{ id: "pi-lens-lsp", text: "lsp:off", tone: "dim" }],
	);
});

test("sanitizes unknown statuses and omits empty ones", () => {
	assert.deepEqual(
		extensionStatusTexts(
			new Map([["custom", "\u001b[31m custom\n status \u001b[0m"]]),
		),
		[{ id: "custom", text: "custom status", tone: "muted" }],
	);
	assert.deepEqual(extensionStatusTexts(new Map([["empty", " \r\n\t "]])), []);
	assert.deepEqual(
		extensionStatusTexts(new Map([["constructor", "prototype key"]])),
		[{ id: "constructor", text: "prototype key", tone: "muted" }],
	);
	assert.deepEqual(extensionStatusTexts(undefined), []);
});
