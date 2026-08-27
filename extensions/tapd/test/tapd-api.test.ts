import assert from "node:assert/strict";
import test from "node:test";
import {
	matchBugMergeVersion,
	matchHistoricalBugMergeVersion,
	tapdKindLabel,
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
