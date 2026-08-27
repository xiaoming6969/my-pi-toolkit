import test from "node:test";
import assert from "node:assert/strict";
import type { TapdItem } from "../types.ts";
import { tableColumns, TreeList } from "../todo/tree-list.ts";

function item(overrides: Partial<TapdItem> & Pick<TapdItem, "id">): TapdItem {
	return {
		kind: "story",
		name: overrides.name ?? overrides.id,
		status: "实现中",
		priority: "高",
		owner: "me",
		workspaceId: "ws",
		workspaceName: "ws",
		children: [],
		depth: 0,
		hasChildren: false,
		...overrides,
	};
}

test("tableColumns hides extra fields on narrow widths and for bugs", () => {
	assert.deepEqual(tableColumns(79, "story"), {
		design: 4,
		status: 8,
		priority: 0,
		severity: 0,
		begin: 0,
		due: 0,
	});
	assert.deepEqual(tableColumns(79, "bug"), {
		design: 0,
		status: 8,
		priority: 0,
		severity: 0,
		begin: 0,
		due: 0,
	});
	assert.deepEqual(tableColumns(100, "story"), {
		design: 4,
		status: 10,
		priority: 6,
		severity: 0,
		begin: 0,
		due: 10,
	});
	assert.deepEqual(tableColumns(120, "bug"), {
		design: 0,
		status: 8,
		priority: 6,
		severity: 6,
		begin: 10,
		due: 10,
	});
});

test("TreeList expands children and moves the selection", () => {
	const child = item({ id: "c", depth: 1, parentId: "p" });
	const list = new TreeList();
	list.setRoots([item({ id: "p", hasChildren: true, children: [child] })]);
	assert.equal(list.getSelectedItem()?.id, "p");
	assert.equal(list.expandedIds.has("p"), false);

	assert.equal(list.handleInput(" "), true);
	assert.equal(list.expandedIds.has("p"), true);
	assert.equal(list.handleInput("\x1b[B"), true);
	assert.equal(list.getSelectedItem()?.id, "c");
	assert.equal(list.handleInput("\x1b[A"), true);
	assert.equal(list.handleInput("\x1b[D"), true);
	assert.equal(list.expandedIds.has("p"), false);
	assert.equal(list.getSelectedItem()?.id, "p");
	assert.equal(list.handleInput("x"), false);
});

test("TreeList renders empty, overflow, and designed story markers", () => {
	const theme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	};
	const empty = new TreeList();
	assert.match(empty.render(80, theme as never).join("\n"), /\(无\)/);

	const child = item({ id: "c", depth: 1, parentId: "p", kind: "bug", severity: "严重" });
	const parent = item({
		id: "p",
		hasChildren: true,
		children: [child],
		begin: "2026-01-01",
		due: "2026-02-01",
	});
	const designed = new Set(["story_ws_p"]);
	const list = new TreeList(designed);
	list.setRoots([parent]);
	list.setMaxVisible(1);
	list.handleInput(" ");
	list.handleInput("\r");
	list.handleInput("\x1b");
	const lines = list.render(160, theme as never);
	assert.ok(lines.length >= 1);
	assert.match(lines.join("\n"), /\[ITEM\]/);
	assert.match(lines.join("\n"), /\[BUG\]/);
	list.onSelect = () => {};
	list.onCancel = () => {};
	assert.equal(list.handleInput("\r"), true);
	assert.equal(list.handleInput("\x1b"), true);
	assert.equal(list.handleInput("\x1b[C"), true);
	assert.equal(list.handleInput("\x1b[D"), true);
});
