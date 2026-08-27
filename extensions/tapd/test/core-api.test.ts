import assert from "node:assert/strict";
import test from "node:test";
import { fetchBugDetail, fetchStoryChildren, fetchStoryDetail, fetchUserInfo, fetchWorkitemTypes, fetchWorkspaces, htmlToText } from "../core/api.ts";
import { fetchAll } from "../core/workspace-api.ts";

const config = { token: "secret", baseUrl: "https://tapd.example" };

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), { status });
}

test("htmlToText converts TAPD HTML entities and breaks", () => {
	assert.equal(
		htmlToText("<p>A&nbsp;B</p><br/><li>x</li>&lt;&gt;&amp;&quot;&#39;"),
		"A B\n\n- x\n<>&\"'",
	);
});

test("fetchUserInfo and fetchWorkspaces read TAPD payloads", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("/users/info"))
			return json({ status: 1, data: { nick: "me" } });
		return json({
			status: 1,
			data: [{ Workspace: { id: "99", name: "ws" } }, { Workspace: null }],
		});
	});
	assert.deepEqual(await fetchUserInfo(config), { nick: "me" });
	assert.deepEqual(await fetchWorkspaces("me", config), [
		{ id: "99", name: "ws" },
	]);
});

test("fetchUserInfo returns null when TAPD has no data", async (t) => {
	t.mock.method(globalThis, "fetch", async () => json({ status: 1 }));
	assert.equal(await fetchUserInfo(config), null);
});

test("fetchWorkspaces returns an empty list without workspace rows", async (t) => {
	t.mock.method(globalThis, "fetch", async () => json({ status: 1 }));
	assert.deepEqual(await fetchWorkspaces("me", config), []);
});

test("fetchStoryDetail and fetchBugDetail require an id", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("/bugs"))
			return json({ status: 1, data: [{ Bug: { id: "8", title: "崩溃" } }] });
		return json({
			status: 1,
			data: [{ Story: { id: "12", name: "登录", description: "d" } }],
		});
	});
	assert.equal((await fetchStoryDetail("99", "12", config))?.name, "登录");
	assert.equal((await fetchBugDetail("99", "8", config))?.title, "崩溃");
});

test("fetchStoryDetail and fetchBugDetail return null without ids", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("/bugs"))
			return json({ status: 1, data: [{ Bug: { title: "无 id" } }] });
		return json({ status: 1, data: [{ Story: { name: "无 id" } }] });
	});
	assert.equal(await fetchStoryDetail("99", "12", config), null);
	assert.equal(await fetchBugDetail("99", "8", config), null);
});

test("fetchStoryDetail returns null for empty rows", async (t) => {
	t.mock.method(globalThis, "fetch", async () => json({ status: 1, data: [] }));
	assert.equal(await fetchStoryDetail("99", "12", config), null);
});

test("fetchWorkitemTypes and fetchStoryChildren page until a short page", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = new URL(String(input));
		if (url.pathname.endsWith("/workitem_types"))
			return json({
				status: 1,
				data: [{ WorkitemType: { id: "t1", name: "开发任务" } }],
			});
		return json({
			status: 1,
			data: [{ Story: { id: "c1", name: "子需求" } }],
		});
	});
	assert.deepEqual(await fetchWorkitemTypes("99", config), [
		{ id: "t1", name: "开发任务" },
	]);
	assert.equal((await fetchStoryChildren("99", "12", config))[0]?.id, "c1");
});

test("fetchWorkitemTypes throws when TAPD returns null", async (t) => {
	t.mock.method(globalThis, "fetch", async () => json({ status: 0 }));
	await assert.rejects(() => fetchWorkitemTypes("99", config), /工作项类型失败/);
});

test("fetchAll maps current-iteration stories and bugs", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("get_user_todo_story") || url.includes("get_user_todo_bug"))
			return json({
				status: 1,
				data: [{ Story: { id: "1" }, Bug: { id: "8" } }],
			});
		if (url.includes("/iterations"))
			return json({
				status: 1,
				data: [
					{
						Iteration: {
							id: "it1",
							name: "sprint",
							startdate: "2000-01-01",
							enddate: "2099-12-31",
						},
					},
				],
			});
		if (url.includes("/workitem_types"))
			return json({
				status: 1,
				data: [{ WorkitemType: { id: "t1", name: "开发任务" } }],
			});
		if (url.includes("/bugs"))
			return json({
				status: 1,
				data: [
					{
						Bug: {
							id: "8",
							title: "崩溃",
							iteration_id: "it1",
							v_status: "新",
							current_owner: "me",
							severity: "致命",
						},
					},
				],
			});
		return json({
			status: 1,
			data: [
				{
					Story: {
						id: "1",
						name: "登录",
						iteration_id: "it1",
						v_status: "实现中",
						workitem_type_id: "t1",
						parent_id: "",
					},
				},
			],
		});
	});
	const stories = await fetchAll(
		[{ id: "99", name: "ws" }],
		config,
		"current",
		new AbortController().signal,
		"story",
	);
	assert.equal(stories.items[0]?.name, "登录");
	assert.equal(stories.items[0]?.workitemTypeName, "开发任务");
	const bugs = await fetchAll(
		[{ id: "99", name: "ws" }],
		config,
		"all",
		new AbortController().signal,
		"bug",
	);
	assert.equal(bugs.items[0]?.kind, "bug");
	assert.equal(bugs.items[0]?.severity, "致命");
});

test("fetchAll pulls missing parent stories into the forest", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("get_user_todo_story"))
			return json({ status: 1, data: [{ Story: { id: "2" } }] });
		if (url.includes("/iterations"))
			return json({
				status: 1,
				data: [
					{
						Iteration: {
							id: "it1",
							name: "sprint",
							startdate: "2000-01-01",
							enddate: "2099-12-31",
						},
					},
				],
			});
		if (url.includes("/workitem_types"))
			return json({ status: 1, data: [] });
		if (url.includes("/stories") && url.includes("id=p1"))
			return json({
				status: 1,
				data: [{ Story: { id: "p1", name: "父需求", iteration_id: "it1" } }],
			});
		return json({
			status: 1,
			data: [
				{
					Story: {
						id: "2",
						name: "子需求",
						iteration_id: "it1",
						parent_id: "p1",
					},
				},
			],
		});
	});
	const result = await fetchAll(
		[{ id: "99", name: "ws" }],
		config,
		"all",
		new AbortController().signal,
		"story",
	);
	assert.equal(result.items.length, 2);
	assert.ok(result.items.some((item) => item.id === "p1"));
});

test("fetchAll returns empty items when there are no todos", async (t) => {
	t.mock.method(globalThis, "fetch", async () => json({ status: 1, data: [] }));
	const result = await fetchAll(
		[{ id: "99", name: "ws" }],
		config,
		"all",
		new AbortController().signal,
	);
	assert.deepEqual(result.items, []);
});

test("fetchStoryChildren throws when TAPD returns null", async (t) => {
	t.mock.method(globalThis, "fetch", async () => json({ status: 0 }));
	await assert.rejects(() => fetchStoryChildren("99", "12", config), /子需求失败/);
});

test("fetchAll drops stories outside the current iteration", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("get_user_todo_story"))
			return json({ status: 1, data: [{ Story: { id: "1" } }] });
		if (url.includes("/iterations"))
			return json({
				status: 1,
				data: [
					{
						Iteration: {
							id: "old",
							name: "past",
							startdate: "2000-01-01",
							enddate: "2000-01-02",
						},
					},
					{ Iteration: { id: "skip" } },
				],
			});
		if (url.includes("/workitem_types"))
			return json({
				status: 1,
				data: [{ WorkitemType: { name: "无 id" } }, { WorkitemType: { id: "t1", name: "开发" } }],
			});
		return json({
			status: 1,
			data: [
				{
					Story: {
						id: "1",
						name: "过期",
						iteration_id: "old",
						status: "实现中",
					},
				},
			],
		});
	});
	const result = await fetchAll(
		[{ id: "99", name: "ws" }],
		config,
		"current",
		new AbortController().signal,
	);
	assert.deepEqual(result.items, []);
});

test("fetchAll maps bugs without a title", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("get_user_todo_bug"))
			return json({ status: 1, data: [{ Bug: { id: "8" } }, { Bug: {} }] });
		if (url.includes("/iterations")) return json({ status: 1, data: [] });
		if (url.includes("/bugs"))
			return json({
				status: 1,
				data: [{ Bug: { id: "8", name: "无名", owner: "me" } }],
			});
		return json({ status: 1, data: [] });
	});
	const result = await fetchAll(
		[{ id: "99", name: "ws" }],
		config,
		"all",
		new AbortController().signal,
		"bug",
	);
	assert.equal(result.items[0]?.name, "无名");
});

