import test from "node:test";
import assert from "node:assert/strict";
import type { KeybindingsManager } from "@earendil-works/pi-tui";
import {
	decodeTableAction,
	renderTableView,
	typeViewport,
} from "../todo/table-view-render.ts";
import { TreeList } from "../todo/tree-list.ts";

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

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as { fg: (color: string, text: string) => string; bold: (text: string) => string };

test("renderTableView covers the type picker and searching table", () => {
	const tree = new TreeList();
	tree.setRoots([
		{
			id: "1",
			kind: "story",
			name: "登录",
			status: "实现中",
			priority: "高",
			owner: "me",
			workspaceId: "ws",
			workspaceName: "ws",
			children: [],
			depth: 0,
			hasChildren: false,
		},
	]);
	const searchInput = {
		getValue: () => "login",
		setValue() {},
		render: () => ["search-box"],
	};
	const table = renderTableView({
		theme: theme as never,
		width: 80,
		rows: 24,
		config: {
			viewLabel: "当前迭代",
			kind: "story",
			storyCount: 1,
			bugCount: 0,
			total: 4,
			typeOptions: ["全部"],
		},
		state: {
			activeType: "功能需求",
			choosingType: false,
			typeIndex: 0,
			focusSearch: true,
			searching: true,
			shownCount: 1,
		},
		tree,
		searchInput: searchInput as never,
	}).join("\n");
	assert.match(table, /\[REQ\]/);
	assert.match(table, /search-box/);
	assert.match(table, /功能需求/);

	const types = renderTableView({
		theme: theme as never,
		width: 40,
		rows: 100,
		config: {
			viewLabel: "当前迭代",
			kind: "story",
			storyCount: 1,
			bugCount: 0,
			total: 1,
			typeOptions: Array.from({ length: 20 }, (_, index) => `type-${index}`),
		},
		state: {
			activeType: null,
			choosingType: true,
			typeIndex: 18,
			focusSearch: false,
			searching: false,
			shownCount: 1,
		},
		tree,
		searchInput: searchInput as never,
	}).join("\n");
	assert.match(types, /按类型筛选/);
	assert.match(types, /type-18/);
	assert.match(types, /\/20/);
});
