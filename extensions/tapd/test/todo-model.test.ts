import assert from "node:assert/strict";
import test from "node:test";
import {
	buildTree,
	bugUrl,
	collectTypes,
	flatFilter,
	fmtDate,
	getTypeLabel,
	oneLine,
	padR,
	prioritySymbol,
	searchFlat,
	sortTree,
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
	assert.equal(fmtDate("2026-01-02T10:00:00Z"), "2026-01-02");
	assert.equal(fmtDate(), "");
	assert.equal(padR("ab", 4).length, 4);
});

test("sortTree, searchFlat, and type collection walk nested items", () => {
	const forest = buildTree([
		item({ id: "p", priority: "低", workitemTypeName: "开发任务", due: "2026-02-01" }),
		item({
			id: "c",
			parentId: "p",
			name: "登录接口",
			priority: "紧急",
			workitemTypeName: "开发任务",
			due: "2026-01-01",
		}),
		item({ id: "d", name: "文档", priority: "高", workitemTypeName: "文档任务" }),
	]);
	sortTree(forest);
	assert.equal(forest[0]?.id, "d");
	assert.equal(forest[1]?.children[0]?.id, "c");
	assert.deepEqual(collectTypes(forest), ["开发任务", "文档任务"]);
	assert.equal(flatFilter(forest, "开发任务").length, 2);
	assert.equal(searchFlat(forest, "登录")[0]?.id, "c");
	assert.deepEqual(searchFlat(forest, "   "), []);
});
