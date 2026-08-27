import assert from "node:assert/strict";
import test from "node:test";
import {
	createBugRemark,
	fetchCommitKeyword,
	fetchObjectIterationCode,
	fetchTaskEstimatedEffort,
	matchBugMergeVersion,
	matchHistoricalBugMergeVersion,
	tapdKindLabel,
	updateTapdStatus,
} from "../git/tapd-api.ts";

const config = { token: "t", baseUrl: "https://tapd.example" };

function fieldsResponse(options: Record<string, string>) {
	return {
		status: 1,
		data: {
			field: { name: "merge_version", label: "合入版本", options },
		},
	};
}

test("tapdKindLabel maps git kinds", () => {
	assert.equal(tapdKindLabel("bug"), "Bug");
	assert.equal(tapdKindLabel("task"), "任务");
	assert.equal(tapdKindLabel("story"), "需求");
});

test("matchHistoricalBugMergeVersion prefers 其他(历史缺陷)", async (t) => {
	t.mock.method(globalThis, "fetch", async () =>
		new Response(
			JSON.stringify(fieldsResponse({ "其他（历史缺陷）": "x" })),
			{ status: 200 },
		),
	);
	assert.deepEqual(await matchHistoricalBugMergeVersion(config, "ws"), {
		fieldName: "merge_version",
		value: "其他（历史缺陷）",
		reason: "未能定位引入 commit",
	});
});

test("matchBugMergeVersion matches exact tags, iteration suffixes, and fallbacks", async (t) => {
	const options = {
		"1.2.0": "a",
		"2.0.0（迭代 12-3）": "b",
		"2.0.0（迭代 12-4）": "c",
		"其他(历史缺陷)": "h",
	};
	t.mock.method(globalThis, "fetch", async () =>
		new Response(JSON.stringify(fieldsResponse(options)), { status: 200 }),
	);

	assert.deepEqual(await matchBugMergeVersion(config, "ws", "refs/tags/1.2.0", []), {
		fieldName: "merge_version",
		value: "1.2.0",
	});
	assert.deepEqual(await matchBugMergeVersion(config, "ws", "2.0.0", ["12-3"]), {
		fieldName: "merge_version",
		value: "2.0.0（迭代 12-3）",
	});
	assert.match(
		(await matchBugMergeVersion(config, "ws", "2.0.0", [])).reason ?? "",
		/没有可用迭代/,
	);
	assert.equal(
		(await matchBugMergeVersion(config, "ws", "9.9.9", [])).value,
		"其他(历史缺陷)",
	);
});

test("matchBugMergeVersion reports missing fields", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () => new Response(JSON.stringify({ status: 1, data: {} }), { status: 200 }),
	);
	assert.deepEqual(await matchBugMergeVersion(config, "ws", "1.0.0", []), {
		reason: "TAPD 未提供合入版本字段",
	});
});

test("fetchCommitKeyword and updateTapdStatus talk to TAPD HTTP", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.includes("get_scm_copy_keywords"))
			return new Response(
				JSON.stringify({ status: 1, data: "--story=12@tapd-99" }),
				{ status: 200 },
			);
		if (url.includes("/tasks"))
			return new Response(
				JSON.stringify({ status: 1, data: [{ Task: { effort: "2" } }] }),
				{ status: 200 },
			);
		if ((init?.method ?? "GET") === "POST")
			return new Response(JSON.stringify({ status: 1, data: {} }), { status: 200 });
		return new Response(
			JSON.stringify({
				status: 1,
				data: [{ Story: { effort_completed: "2" } }],
			}),
			{ status: 200 },
		);
	});
	const object = {
		kind: "story" as const,
		workspaceId: "99",
		objectId: "12",
		shortId: "12",
		keyword: "feat",
	};
	assert.equal(await fetchCommitKeyword(config, object), "--story=12@tapd-99");
	assert.equal(await fetchTaskEstimatedEffort(config, { ...object, kind: "task" }), "2");
	await updateTapdStatus(config, object, "实现中", "me", {
		effort_completed: "2",
	});
});

test("tapd-api covers effort retries, iteration codes, and remarks", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.includes("get_scm_copy_keywords"))
			return new Response(JSON.stringify({ status: 1, data: "" }), { status: 200 });
		if (url.includes("/iterations"))
			return new Response(
				JSON.stringify({
					status: 1,
					data: [{ Iteration: { name: "迭代 12-3 版本" } }],
				}),
				{ status: 200 },
			);
		if (url.includes("/bugs") && (init?.method ?? "GET") === "GET")
			return new Response(
				JSON.stringify({
					status: 1,
					data: [{ Bug: { iteration_id: "7", effort_completed: "1" } }],
				}),
				{ status: 200 },
			);
		if ((init?.method ?? "GET") === "POST")
			return new Response(JSON.stringify({ status: 1, data: {} }), { status: 200 });
		return new Response(JSON.stringify({ status: 1, data: [] }), { status: 200 });
	});
	await assert.rejects(
		() =>
			fetchCommitKeyword(config, {
				kind: "story",
				workspaceId: "99",
				objectId: "12",
				shortId: "12",
				keyword: "feat",
			}),
		/无法获取 TAPD 源码提交关键字/,
	);
	assert.equal(
		await fetchObjectIterationCode(config, {
			kind: "bug",
			workspaceId: "99",
			objectId: "8",
			shortId: "8",
			keyword: "fix",
		}),
		"12-3",
	);
	await createBugRemark(
		config,
		{
			kind: "bug",
			workspaceId: "99",
			objectId: "8",
			shortId: "8",
			keyword: "fix",
		},
		"me",
		"备注",
	);
	await assert.rejects(
		() =>
			updateTapdStatus(
				config,
				{
					kind: "bug",
					workspaceId: "99",
					objectId: "8",
					shortId: "8",
					keyword: "fix",
				},
				"已关闭",
				undefined,
				{ effort_completed: "9" },
			),
		/完成工时回读不一致/,
	);
});

test("matchBugMergeVersion reports empty options and ambiguous iterations", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () =>
			new Response(
				JSON.stringify(
					fieldsResponse({
						"2.0.0（迭代 1-1）": "a",
						"2.0.0（迭代 1-2）": "b",
					}),
				),
				{ status: 200 },
			),
	);
	assert.match(
		(await matchBugMergeVersion(config, "ws", "2.0.0", ["1-1", "1-2"])).reason ?? "",
		/多个迭代/,
	);
	assert.match(
		(await matchBugMergeVersion(config, "ws", "2.0.0", ["9-9"])).reason ?? "",
		/无法唯一匹配/,
	);
});

test("matchBugMergeVersion reports a field without options", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () =>
			new Response(
				JSON.stringify({
					status: 1,
					data: { field: { name: "merge_version", label: "合入版本" } },
				}),
				{ status: 200 },
			),
	);
	assert.deepEqual(await matchBugMergeVersion(config, "ws", "1.0.0", []), {
		fieldName: "merge_version",
		reason: "合入版本字段没有候选值",
	});
});

test("matchBugMergeVersion reports empty option maps", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () =>
			new Response(JSON.stringify(fieldsResponse({})), { status: 200 }),
	);
	assert.deepEqual(await matchBugMergeVersion(config, "ws", "1.0.0", []), {
		fieldName: "merge_version",
		reason: "合入版本字段没有候选值",
	});
});

test("matchHistoricalBugMergeVersion reports a missing historical option", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () =>
			new Response(JSON.stringify(fieldsResponse({ "1.0.0": "a" })), {
				status: 200,
			}),
	);
	assert.match(
		(await matchHistoricalBugMergeVersion(config, "ws")).reason ?? "",
		/没有“其他/,
	);
});

test("matchHistoricalBugMergeVersion reports a missing field", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () => new Response(JSON.stringify({ status: 1, data: {} }), { status: 200 }),
	);
	assert.deepEqual(await matchHistoricalBugMergeVersion(config, "ws"), {
		reason: "TAPD 未提供合入版本字段",
	});
});

test("matchBugMergeVersion falls back without a historical option", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () =>
			new Response(JSON.stringify(fieldsResponse({ "1.0.0": "a" })), {
				status: 200,
			}),
	);
	assert.match(
		(await matchBugMergeVersion(config, "ws", "9.9.9", [])).reason ?? "",
		/没有“其他/,
	);
});

test("fetchTaskEstimatedEffort ignores empty or invalid effort", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () =>
			new Response(
				JSON.stringify({ status: 1, data: [{ Task: { effort: "0" } }] }),
				{ status: 200 },
			),
	);
	assert.equal(
		await fetchTaskEstimatedEffort(config, {
			kind: "task",
			workspaceId: "99",
			objectId: "1",
			shortId: "1",
			keyword: "feat",
		}),
		undefined,
	);
});

test("updateTapdStatus returns after posting without effort fields", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () => new Response(JSON.stringify({ status: 1, data: {} }), { status: 200 }),
	);
	await updateTapdStatus(
		config,
		{
			kind: "task",
			workspaceId: "99",
			objectId: "1",
			shortId: "1",
			keyword: "feat",
		},
		"实现中",
		"me",
	);
});

test("updateTapdStatus throws when TAPD returns nothing", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () => new Response(JSON.stringify({ status: 0 }), { status: 200 }),
	);
	await assert.rejects(
		() =>
			updateTapdStatus(
				config,
				{
					kind: "story",
					workspaceId: "99",
					objectId: "1",
					shortId: "1",
					keyword: "feat",
				},
				"实现中",
			),
		/状态更新失败/,
	);
});

test("fetchObjectIterationCode returns null without an iteration", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () =>
			new Response(JSON.stringify({ status: 1, data: [{ Story: {} }] }), {
				status: 200,
			}),
	);
	assert.equal(
		await fetchObjectIterationCode(config, {
			kind: "story",
			workspaceId: "99",
			objectId: "1",
			shortId: "1",
			keyword: "feat",
		}),
		null,
	);
});

test("fetchObjectIterationCode reads task iteration names", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("/iterations"))
			return new Response(
				JSON.stringify({
					status: 1,
					data: [{ Iteration: { name: "迭代 3-1" } }],
				}),
				{ status: 200 },
			);
		return new Response(
			JSON.stringify({
				status: 1,
				data: [{ Task: { iteration_id: "it" } }],
			}),
			{ status: 200 },
		);
	});
	assert.equal(
		await fetchObjectIterationCode(config, {
			kind: "task",
			workspaceId: "99",
			objectId: "1",
			shortId: "1",
			keyword: "feat",
		}),
		"3-1",
	);
});

test("createBugRemark throws when TAPD returns nothing", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () => new Response(JSON.stringify({ status: 0 }), { status: 200 }),
	);
	await assert.rejects(
		() =>
			createBugRemark(
				config,
				{
					kind: "bug",
					workspaceId: "99",
					objectId: "8",
					shortId: "8",
					keyword: "fix",
				},
				"me",
				"备注",
			),
		/流转备注写入失败/,
	);
});
