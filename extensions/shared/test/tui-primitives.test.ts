import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
	overlayInnerWidth,
	overlayPanelHeight,
	overlayViewportHeight,
	OVERLAY_CHROME_ROWS,
	renderOverlayShell,
	STANDARD_OVERLAY_MARGIN,
} from "../tui/overlay-shell.ts";
import { toolCall, toolHeader, toolResult } from "../tui/tool-render.ts";
import {
	modeEditorBorder,
	mutedLine,
	secondaryLine,
	sectionRule,
	statusGlyph,
	thinkingLevelText,
	timelineLine,
	UI_GLYPHS,
} from "../tui/visual-language.ts";
import {
	registerAboveEditorRestack,
	restackAboveEditorWidgets,
} from "../tui/widget-restack.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

test("overlay height budget subtracts chrome and clamps width", () => {
	assert.equal(overlayInnerWidth(10), 18);
	assert.equal(overlayInnerWidth(40), 38);
	assert.equal(overlayPanelHeight(100), Math.floor((100 - STANDARD_OVERLAY_MARGIN * 2) * 0.88));
	assert.equal(
		overlayViewportHeight(100),
		overlayPanelHeight(100) - OVERLAY_CHROME_ROWS,
	);
	assert.equal(overlayPanelHeight(1, { margin: 10 }), 1);
	const lines = renderOverlayShell(theme, 24, {
		header: "Title",
		body: ["row"],
		footer: "esc",
	});
	assert.equal(lines[0]?.startsWith("╭"), true);
	assert.match(lines.join("\n"), /Title/);
	assert.match(lines.join("\n"), /row/);
	assert.match(lines.join("\n"), /esc/);
	assert.equal(lines.at(-1)?.startsWith("╰"), true);
});

test("tool renderers emit status glyphs, details, body, and hints", () => {
	const call = toolCall(theme, "read", "file.ts", "12 lines").render(80).join("\n");
	assert.match(call, new RegExp(UI_GLYPHS.active));
	assert.match(call, /read/);
	assert.match(call, /12 lines/);
	assert.equal(
		toolHeader(theme, { status: "success", title: "bash", summary: "ok" }),
		`${UI_GLYPHS.success} bash ok`,
	);
	const result = toolResult(theme, {
		status: "error",
		title: "write",
		summary: "failed",
		details: ["path.ts"],
		body: "boom",
		hint: "Ctrl+O",
	})
		.render(80)
		.join("\n");
	assert.match(result, new RegExp(UI_GLYPHS.error));
	assert.match(result, /path\.ts/);
	assert.match(result, /boom/);
	assert.match(result, /Ctrl\+O/);
});

test("visual language maps status, mode badges, and thinking levels", () => {
	assert.equal(statusGlyph(theme, "pending"), UI_GLYPHS.pending);
	assert.equal(modeEditorBorder(theme, "plan", 0, (text) => text), "");
	assert.equal(modeEditorBorder(theme, "ask", 1, (text) => text), "─");
	const border = modeEditorBorder(theme, "build", 20, (text) => text);
	assert.match(border, /BUILD/);
	assert.equal(visibleWidth(border), 20);
	assert.equal(mutedLine(theme, "note"), "note");
	assert.match(secondaryLine(theme, "next"), new RegExp(UI_GLYPHS.branch));
	assert.match(timelineLine(theme, "log"), new RegExp(UI_GLYPHS.line));
	assert.equal(sectionRule(theme, 3), "───");
	assert.equal(thinkingLevelText("high", theme), "think:high");
	assert.equal(thinkingLevelText("high", theme, true), "high");
	assert.equal(thinkingLevelText("unknown", theme), "think:unknown");
});

test("above-editor restack only runs while UI is active", () => {
	const keys: string[] = [];
	const unregister = registerAboveEditorRestack((ctx) => {
		ctx.ui.setWidget("panel", "x");
		keys.push("ran");
	});
	try {
		restackAboveEditorWidgets({
			hasUI: false,
			ui: { setWidget() {} },
		});
		assert.deepEqual(keys, []);
		restackAboveEditorWidgets({
			hasUI: true,
			ui: {
				setWidget(key) {
					keys.push(key);
				},
			},
		});
		assert.ok(keys.includes("ran"));
		assert.ok(keys.includes("panel"));
	} finally {
		unregister();
	}
	restackAboveEditorWidgets({
		hasUI: true,
		ui: {
			setWidget() {
				keys.push("leaked");
			},
		},
	});
	assert.equal(keys.includes("leaked"), false);
});
