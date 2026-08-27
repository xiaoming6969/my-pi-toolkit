import assert from "node:assert/strict";
import test from "node:test";
import {
	buildTree,
	bugUrl,
	getTypeLabel,
	oneLine,
	prioritySymbol,
	storyUrl,
	tapdUrl,
} from "../todo/model.ts";

function item(overrides) {
	return {
		id: "1",
		kind: "story",
		name: "需求",
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

test("buildTree nests children and computes depth", () => {
	const roots = buildTree([
		item({ id: "p" }),
		item({ id: "c", parentId: "p", name: "子需求" }),
	]);
	assert.equal(roots.length, 1);
	assert.equal(roots[0].hasChildren, true);
	assert.equal(roots[0].children[0].id, "c");
	assert.equal(roots[0].children[0].depth, 1);
});

test("tapdUrl and labels follow item kind and type name", () => {
	assert.equal(storyUrl("ws", "12"), "https://www.tapd.cn/ws/prong/stories/view/12");
	assert.equal(bugUrl("ws", "9"), "https://www.tapd.cn/ws/bugtrace/bugs/view/9");
	assert.equal(tapdUrl(item({ kind: "bug", id: "9" })), bugUrl("ws", "9"));
	assert.equal(getTypeLabel(item({ kind: "bug" })), "BUG");
	assert.equal(getTypeLabel(item({ workitemTypeName: "开发任务" })), "DEV");
	assert.equal(prioritySymbol("High"), "高");
	assert.equal(prioritySymbol("unknown"), "unknown");
	assert.equal(oneLine(" a\n b\t c  "), "a b c");
});
