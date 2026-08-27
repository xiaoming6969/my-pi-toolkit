import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { renderDashboard } from "../layout.ts";
import { equalize, panelBody } from "../panels.ts";
import { box, fit, inset, joinRows } from "../tui-utils.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

const data = {
	contexts: ["AGENTS.md"],
	skills: ["one", "two"],
	extensions: ["ming-core"],
	themes: ["dark"],
};

test("tui helpers pad, box, and join columns", () => {
	assert.equal(fit("ab", 4), "ab  ");
	assert.equal(fit("ab", 0), "");
	assert.deepEqual(inset(["x"], 2), ["  x"]);
	const framed = box(["hi"], 8, (text) => text);
	assert.equal(framed[0], "╭──────╮");
	assert.equal(framed[1], "│hi    │");
	assert.deepEqual(joinRows([["a"], ["b", "c"]], [1, 1]), ["a  b", "   c"]);
	const groups = [["a"], ["b", "c"]];
	equalize(groups);
	assert.equal(groups[0]?.length, 2);
	assert.match(panelBody("SKILLS", [], 10, (text) => text, (text) => text).join("\n"), /none/);
	assert.match(
		panelBody("SKILLS", ["alpha", "beta"], 20, (text) => text, (text) => text, 2).join("\n"),
		/alpha/,
	);
});

test("renderDashboard degrades by width", () => {
	assert.deepEqual(renderDashboard(0, data, theme), []);
	assert.deepEqual(renderDashboard(12, data, theme), [fit("M-PI BUILD", 12)]);
	const narrow = renderDashboard(40, data, theme).join("\n");
	assert.match(narrow, /CONTEXT/);
	assert.match(narrow, /AGENTS.md/);
	assert.match(narrow, new RegExp(`Pi v${VERSION}`));
	const wide = renderDashboard(120, data, theme).join("\n");
	assert.match(wide, /Ready/);
	assert.match(wide, /EXTENSIONS/);
	const medium = renderDashboard(90, data, theme).join("\n");
	assert.match(medium, /SKILLS/);
	assert.match(medium, /Ready/);
});
