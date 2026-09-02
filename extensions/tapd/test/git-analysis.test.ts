import assert from "node:assert/strict";
import test from "node:test";
import { uniqueLinkedObjects, parseIntroducedCommit } from "../git/analysis.ts";
import { currentTapdObject } from "../git/context.ts";
import { fetchBugMrFields, matchCategoryOption, selectCategoryOption } from "../git/bug-fields.ts";
import {
	collectManualBugRootCauseDraft,
	deleteBugRootCauseDraft,
	loadBugRootCauseDraft,
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

test("selectCategoryOption walks TAPD option trees", async () => {
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
	assert.equal(
		await selectCategoryOption(
			leaves,
			async (title) => (title === "p" ? "前端" : undefined),
			{ parent: "p", child: "c" },
		),
		undefined,
	);
	assert.equal(matchCategoryOption("none", leaves), undefined);
	assert.equal(matchCategoryOption(" ", leaves), undefined);
	assert.equal(
		matchCategoryOption("交互", [
			{ label: "前端 / 交互", value: "前端/交互", path: ["前端", "交互"] },
			{ label: "后端 / 交互", value: "后端/交互", path: ["后端", "交互"] },
		]),
		undefined,
	);
});

test("root-cause draft parse/render round-trips editor sections", () => {
	const generated = parseGeneratedCauseAndFix(
		"```md\n【产生原因】空指针\n【引入commit】abc1234\n【修复】加判断\n【根因大类】后端/接口\n```",
	);
	assert.deepEqual(generated, {
		cause: "空指针",
		fix: "加判断",
		category: "后端/接口",
		introducedCommit: "abc1234",
	});
	assert.equal(
		parseGeneratedCauseAndFix(
			"【产生原因】空指针\n【修复】加判断\n【根因大类】后端/接口",
		)?.introducedCommit,
		undefined,
	);
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
	assert.throws(
		() =>
			parseBugRootCauseEditor(
				"【产生原因】x\n【引入commit】abc\n【修复】z",
				"8",
				"head",
			),
		/请保留【commit信息】/,
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

test("fetchBugMrFields flattens cascade, pipe, and object options", async (t) => {
	t.mock.method(globalThis, "fetch", async () =>
		new Response(
			JSON.stringify({
				status: 1,
				data: {
					cat: {
						name: "custom_field_1",
						label: "根因大类",
						options: [
							{
								label: "前端",
								children: [{ name: "交互" }, { label: "  " }, "样式"],
							},
							"其它",
							{ children: [] },
						],
					},
					dev: { name: "developer", label: "开发人员" },
				},
			}),
			{ status: 200 },
		),
	);
	const fields = await fetchBugMrFields({ token: "t", baseUrl: "https://tapd.example" }, "ws");
	assert.equal(fields.developerFieldName, "developer");
	assert.ok(fields.category?.leaves.some((leaf) => leaf.value === "前端/交互"));
	assert.ok(fields.category?.leaves.some((leaf) => leaf.value === "其它"));
});

test("fetchBugMrFields reads pipe-delimited and object maps", async (t) => {
	t.mock.method(globalThis, "fetch", async () =>
		new Response(
			JSON.stringify({
				status: 1,
				data: {
					cat: {
						name: "custom_field_1",
						label: "根因大类",
						options: "前端|后端|",
					},
				},
			}),
			{ status: 200 },
		),
	);
	const fields = await fetchBugMrFields({ token: "t", baseUrl: "https://tapd.example" }, "ws");
	assert.deepEqual(
		fields.category?.leaves.map((leaf) => leaf.value),
		["前端", "后端"],
	);
});

test("fetchBugMrFields reads object option maps and empty payloads", async (t) => {
	t.mock.method(globalThis, "fetch", async () =>
		new Response(JSON.stringify({ status: 1, data: {} }), { status: 200 }),
	);
	const empty = await fetchBugMrFields({ token: "t", baseUrl: "https://tapd.example" }, "ws");
	assert.equal(empty.category, undefined);
	assert.equal(empty.developerFieldName, undefined);
});

test("fetchBugMrFields reads object option maps", async (t) => {
	t.mock.method(globalThis, "fetch", async () =>
		new Response(
			JSON.stringify({
				status: 1,
				data: {
					cat: {
						name: "custom_field_1",
						label: "根因大类",
						options: { 前端: "a", "": "skip" },
					},
				},
			}),
			{ status: 200 },
		),
	);
	const fields = await fetchBugMrFields({ token: "t", baseUrl: "https://tapd.example" }, "ws");
	assert.deepEqual(
		fields.category?.leaves.map((leaf) => leaf.value),
		["前端"],
	);
});

test("fetchBugMrFields returns empty when TAPD has no data", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () => new Response(JSON.stringify({ status: 1 }), { status: 200 }),
	);
	assert.deepEqual(
		await fetchBugMrFields({ token: "t", baseUrl: "https://tapd.example" }, "ws"),
		{},
	);
});


test("root-cause drafts persist per bug and collect editor input", async (t) => {
	const { mkdir, writeFile } = await import("node:fs/promises");
	const { join } = await import("node:path");
	const { createFeatureGitRepo } = await import("./git-repo.ts");
	const dir = await createFeatureGitRepo(t);
	assert.equal(await loadBugRootCauseDraft(dir, "8", "head"), null);
	await deleteBugRootCauseDraft(dir, "8");
	const draftDir = join(dir, ".pi", "tapd-root-cause");
	await mkdir(draftDir, { recursive: true });
	await writeFile(
		join(draftDir, "8.json"),
		JSON.stringify({
			head: "head",
			bugId: "8",
			cause: "空指针",
			introducedCommit: "abc1234",
			commitInfo: "abc 作者",
			fix: "加判断",
			category: "后端",
		}),
	);
	const loaded = await loadBugRootCauseDraft(dir, "8", "head");
	assert.equal(loaded?.cause, "空指针");
	assert.equal(loaded?.category, "后端");
	assert.equal(await loadBugRootCauseDraft(dir, "8", "other"), null);
	await writeFile(join(draftDir, "8.json"), "{");
	assert.equal(await loadBugRootCauseDraft(dir, "8", "head"), null);
	await deleteBugRootCauseDraft(dir, "8");

	const collected = await collectManualBugRootCauseDraft(
		{
			ui: {
				editor: async (_title: string, template: string) => template,
			},
		} as never,
		"8",
		"HEAD",
		{
			hash: "abc1234",
			shortHash: "abc1234",
			date: "2026-01-01",
			author: "me",
			subject: "fix",
		},
		{ cause: "空指针", fix: "加判断" },
	);
	assert.equal(collected?.introducedCommit, "abc1234");
	assert.equal(
		await collectManualBugRootCauseDraft(
			{ ui: { editor: async () => undefined } } as never,
			"8",
			"HEAD",
			undefined,
		),
		null,
	);
});
