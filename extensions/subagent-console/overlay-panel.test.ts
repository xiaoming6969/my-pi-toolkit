import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	visibleWidth,
	type KeybindingsManager,
	type TUI,
} from "@earendil-works/pi-tui";
import type { LiveSubagentRun } from "../shared/subagent/registry.ts";
import type { SharedMarkdownRendering } from "../shared/tui/markdown.ts";
import type { SubagentView } from "./detail-navigation.ts";
import {
	createSubagentOverlay,
	renderSubagentHeader,
	subagentOperationalText,
} from "./overlay-panel.ts";
import { formatRunLabel } from "./run-label.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

const now = Date.parse("2026-01-01T00:10:00.000Z");
const run: SubagentView = {
	id: "12345678-full-id",
	title: "Long running implementation worker with a descriptive title",
	model: "provider/model",
	thinkingLevel: "high",
	cwd: process.cwd(),
	status: "running",
	reusable: true,
	turnCount: 2,
	queuedCount: 3,
	turnStartedAt: "2026-01-01T00:08:30.000Z",
	entries: [],
};

test("formats exact queued, runtime, and idle metadata responsively", () => {
	assert.equal(
		subagentOperationalText(run, now),
		"queued 3 · running 1m 30s",
	);
	assert.match(
		formatRunLabel({
			title: run.title,
			state: "running",
			startedAt: run.turnStartedAt,
			live: run as LiveSubagentRun,
		}),
		/queued 3 · running/,
	);
	assert.equal(
		subagentOperationalText(
			{
				...run,
				status: "completed",
				queuedCount: 0,
				turnStartedAt: undefined,
				idleDeadlineAt: "2026-01-01T00:11:40.000Z",
			},
			now,
		),
		"idle 1m 40s",
	);
	for (const width of [58, 78, 118, 158])
		assert.ok(
			visibleWidth(renderSubagentHeader(run, "1/2", theme, width, now)) <=
				width,
			`header exceeded ${width} columns`,
		);
});

test("overlay stays within 60/80/120/160 columns and clears its refresh timer", (context) => {
	context.mock.timers.enable({ apis: ["setInterval"] });
	let renders = 0;
	const tui = {
		mode: "fullscreen",
		terminal: { rows: 30, write() {} },
		requestRender() {},
	} as unknown as TUI;
	const keybindings = {
		matches: () => false,
		getKeys: () => [],
	} as unknown as KeybindingsManager;
	const markdown = {
		mermaidMode: "off",
		transformers: [],
		options: () => ({}),
	} as unknown as SharedMarkdownRendering;
	const component = createSubagentOverlay({
		items: [{ id: run.id ?? "run", load: () => run }],
		initialId: run.id ?? "run",
		tui,
		requestRender: () => renders++,
		theme,
		keybindings,
		markdown,
		close() {},
	});
	for (const width of [60, 80, 120, 160])
		assert.ok(
			component.render(width).every((line) => visibleWidth(line) <= width),
			`overlay exceeded ${width} columns`,
		);
	context.mock.timers.tick(1_000);
	assert.equal(renders, 1);
	component.dispose();
	context.mock.timers.tick(2_000);
	assert.equal(renders, 1);
});
