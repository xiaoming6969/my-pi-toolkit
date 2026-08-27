import assert from "node:assert/strict";
import test from "node:test";
import { uniqueLinkedObjects, parseIntroducedCommit } from "../git/analysis.ts";
import { candidateLabel } from "../git/bug-analysis.ts";
import { selectCategoryOption } from "../git/bug-fields.ts";
import { currentTapdObject } from "../git/context.ts";
import {
	parseBugRootCauseEditor,
	parseGeneratedCauseAndFix,
	renderBugRootCauseDraft,
} from "../git/root-cause-draft.ts";
import {
	TAPD_SESSION_STATE_TYPE,
	type TapdSessionState,
} from "../sessions/session-state.ts";

const keyword = {
	kind: "story" as const,
	shortId: "12",
	objectId: "12",
	workspaceId: "99",
	keyword: "feat",
};

test("uniqueLinkedObjects and parseIntroducedCommit keep confirmed hashes", () => {
	assert.deepEqual(
		uniqueLinkedObjects([
			{ hash: "aa", subject: "one", objects: [keyword] },
			{
				hash: "bb",
				subject: "two",
				objects: [
					keyword,
					{ ...keyword, kind: "bug", shortId: "8", objectId: "8" },
				],
			},
		]),
		[keyword, { ...keyword, kind: "bug", shortId: "8", objectId: "8" }],
	);
	assert.equal(parseIntroducedCommit("【引入commit】abc1234"), "abc1234");
	assert.equal(parseIntroducedCommit("【引入commit】未能定位"), null);
	assert.equal(parseIntroducedCommit("【引入commit】unknown"), null);
	assert.equal(parseIntroducedCommit("【引入commit】not-a-hash"), null);
	assert.equal(parseIntroducedCommit("no field"), null);
});

test("candidateLabel and selectCategoryOption walk TAPD option trees", async () => {
	assert.equal(
		candidateLabel({
			hash: "abc",
			shortHash: "abc1234",
			date: "2026-01-01",
			author: "me",
			subject: "fix crash",
			lineCount: 4,
			files: ["a.ts", "b.ts"],
		}),
		"abc1234 · 命中 4 行/2 文件 · fix crash",
	);

	const leaves = [
		{ label: "前端 / 交互", value: "前端/交互", path: ["前端", "交互"] },
		{ label: "前端 / 样式", value: "前端/样式", path: ["前端", "样式"] },
		{ label: "后端 / 接口", value: "后端/接口", path: ["后端", "接口"] },
	];
	assert.equal(
		await selectCategoryOption(leaves, async () => undefined, {
			parent: "p",
			child: "c",
		}),
		undefined,
	);
	assert.equal(
		await selectCategoryOption(
			[leaves[2]],
			async () => {
				throw new Error("should not prompt for a single leaf");
			},
			{ parent: "p", child: "c" },
		),
		"后端/接口",
	);
	assert.equal(
		await selectCategoryOption(
			leaves,
			async (title, options) => {
				if (title === "p") {
					assert.deepEqual(options, ["前端", "后端"]);
					return "前端";
				}
				assert.deepEqual(options, ["交互", "样式"]);
				return "样式";
			},
			{ parent: "p", child: "c" },
		),
		"前端/样式",
	);
});

test("root-cause draft parse/render round-trips editor sections", () => {
	const generated = parseGeneratedCauseAndFix(
		"```md\n【产生原因】空指针\n【修复】加判断\n【根因大类】后端/接口\n```",
	);
	assert.deepEqual(generated, {
		cause: "空指针",
		fix: "加判断",
		category: "后端/接口",
	});
	assert.equal(parseGeneratedCauseAndFix("plain"), null);

	const draft = parseBugRootCauseEditor(
		["【产生原因】空指针", "【引入commit】abc1234 extra", "【commit信息】abc 作者", "【修复】加判断"].join(
			"\n",
		),
		"8",
		"head",
	);
	assert.equal(draft.introducedCommit, "abc1234");
	assert.equal(draft.cause, "空指针");
	assert.match(renderBugRootCauseDraft(draft), /【引入commit】abc1234/);
	assert.throws(
		() => parseBugRootCauseEditor("【产生原因】x\n【commit信息】y\n【修复】z", "8", "head"),
		/请保留【引入commit】/,
	);
});

test("currentTapdObject reads the session link", () => {
	const state: TapdSessionState = {
		version: 1,
		workspaceId: "ws",
		itemId: "12",
		kind: "bug",
		itemName: "崩溃",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
	assert.throws(
		() =>
			currentTapdObject({
				sessionManager: { getEntries: () => [] },
			} as never),
		/没有关联 TAPD 事项/,
	);
	assert.deepEqual(
		currentTapdObject({
			sessionManager: {
				getEntries: () => [
					{
						type: "custom",
						customType: TAPD_SESSION_STATE_TYPE,
						data: state,
					},
				],
			},
		} as never),
		{
			workspaceId: "ws",
			objectId: "12",
			kind: "bug",
			name: "崩溃",
		},
	);
});
