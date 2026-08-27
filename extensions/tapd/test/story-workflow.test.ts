import assert from "node:assert/strict";
import test from "node:test";
import {
	updateStoryForDraftMergeRequest,
	updateStoryForMergeRequest,
} from "../git/story-workflow.ts";

const config = { token: "t", baseUrl: "https://tapd.example" };
const object = {
	kind: "story" as const,
	workspaceId: "99",
	objectId: "12",
	shortId: "12",
	keyword: "feat",
};

function ok(data: unknown) {
	return new Response(JSON.stringify({ status: 1, data }), { status: 200 });
}

test("updateStoryForDraftMergeRequest skips the functional story and completes owned development children", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		if (url.includes("/users/info")) return ok({ nick: "me" });
		if (url.includes("/workitem_types"))
			return ok([
				{ WorkitemType: { id: "dev", name: "开发子需求", english_name: "development" } },
				{ WorkitemType: { id: "test", name: "测试需求", english_name: "test" } },
			]);
		if (method === "POST") return ok({});
		if (url.includes("effort_completed"))
			return ok([{ Story: { id: "c1", effort_completed: "2" } }]);
		if (url.includes("parent_id="))
			return ok([
				{
					Story: {
						id: "c1",
						name: "子开发",
						owner: "me",
						workitem_type_id: "dev",
						effort: "2",
					},
				},
			]);
		return ok([
			{
				Story: {
					id: "12",
					name: "登录",
					parent_id: "0",
					owner: "me",
					workitem_type_id: "func",
				},
			},
		]);
	});
	const draft = await updateStoryForDraftMergeRequest(config, object);
	assert.ok(draft.some((line) => line.includes("跳过（草稿 MR 不流转）")));
	assert.ok(draft.some((line) => line.includes("开发子需求")));
	const ready = await updateStoryForMergeRequest(config, object);
	assert.ok(ready.some((line) => line.includes("功能需求")));
});

test("updateStoryForMergeRequest completes a development child story", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.includes("/workitem_types"))
			return ok([
				{ WorkitemType: { id: "dev", name: "开发子需求", english_name: "development" } },
			]);
		if ((init?.method ?? "GET") === "POST") return ok({});
		if (url.includes("effort_completed"))
			return ok([{ Story: { id: "12", effort_completed: "3" } }]);
		return ok([
			{
				Story: {
					id: "12",
					name: "子开发",
					parent_id: "1",
					workitem_type_id: "dev",
					effort: "3",
				},
			},
		]);
	});
	const lines = await updateStoryForMergeRequest(config, object);
	assert.match(lines[0] ?? "", /开发子需求/);
});

test("updateStoryForDraftMergeRequest skips non-development child stories", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("/workitem_types"))
			return ok([
				{ WorkitemType: { id: "dev", name: "开发子需求", english_name: "development" } },
				{ WorkitemType: { id: "test", name: "测试需求", english_name: "test" } },
			]);
		return ok([
			{
				Story: {
					id: "12",
					name: "测试子",
					parent_id: "1",
					workitem_type_id: "test",
				},
			},
		]);
	});
	const lines = await updateStoryForDraftMergeRequest(config, object);
	assert.match(lines[0] ?? "", /跳过（草稿 MR 不流转测试需求）/);
});

test("updateStoryForMergeRequest covers missing story, test children, and unowned functional stories", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.includes("/workitem_types"))
			return ok([
				{ WorkitemType: { id: "dev", name: "开发子需求" } },
				{ WorkitemType: { id: "test", name: "测试需求", english_name: "testing" } },
			]);
		if (url.includes("/users/info")) return ok({ nick: "me" });
		if ((init?.method ?? "GET") === "POST") return ok({});
		if (url.includes("effort_completed"))
			return ok([{ Story: { id: "12", effort_completed: "1" } }]);
		if (url.includes("parent_id="))
			return ok([
				{
					Story: {
						id: "c-test",
						name: "测试子",
						owner: "me",
						workitem_type_id: "test",
						effort: "bad",
					},
				},
			]);
		return ok([
			{
				Story: {
					id: "12",
					name: "功能",
					parent_id: "0",
					owner: "other",
					workitem_type_id: "func",
				},
			},
		]);
	});
	const lines = await updateStoryForMergeRequest(config, object);
	assert.ok(lines.some((line) => line.includes("处理人不是当前用户")));
	assert.ok(lines.some((line) => line.includes("测试需求")));
});

test("updateStoryForMergeRequest completes owned test stories and reports missing users", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.includes("/workitem_types"))
			return ok([
				{ WorkitemType: { id: "dev", name: "开发子需求", english_name: "development" } },
				{ WorkitemType: { id: "test", name: "测试需求", english_name: "test" } },
			]);
		if (url.includes("/users/info")) return ok({});
		if ((init?.method ?? "GET") === "POST") return ok({});
		return ok([
			{
				Story: {
					id: "12",
					name: "测试子",
					parent_id: "1",
					owner: "me",
					workitem_type_id: "test",
					effort: "2",
				},
			},
		]);
	});
	await assert.rejects(
		() => updateStoryForMergeRequest(config, object),
		/无法获取当前 TAPD 用户/,
	);
});

test("updateStoryForDraftMergeRequest skips non-development child stories that are not tests", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("/workitem_types"))
			return ok([
				{ WorkitemType: { id: "dev", name: "开发子需求", english_name: "development" } },
			]);
		return ok([
			{
				Story: {
					id: "12",
					name: "其它",
					parent_id: "1",
					workitem_type_id: "other",
				},
			},
		]);
	});
	assert.match(
		(await updateStoryForDraftMergeRequest(config, object))[0] ?? "",
		/非开发子需求/,
	);
});

test("updateStoryForDraftMergeRequest throws without a development workitem type", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("/workitem_types")) return ok([]);
		return ok([{ Story: { id: "12", name: "登录", parent_id: "0" } }]);
	});
	await assert.rejects(
		() => updateStoryForDraftMergeRequest(config, object),
		/未找到“开发子需求”/,
	);
});

test("updateStoryForDraftMergeRequest throws when the story cannot be loaded", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("/workitem_types"))
			return ok([
				{ WorkitemType: { id: "dev", name: "开发子需求", english_name: "development" } },
			]);
		return ok([]);
	});
	await assert.rejects(
		() => updateStoryForDraftMergeRequest(config, object),
		/无法获取 TAPD 需求/,
	);
});

test("updateStoryForMergeRequest completes an owned test child story", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.includes("/workitem_types"))
			return ok([
				{ WorkitemType: { id: "dev", name: "开发子需求", english_name: "development" } },
				{ WorkitemType: { id: "test", name: "测试需求", english_name: "test" } },
			]);
		if (url.includes("/users/info")) return ok({ nick: "me" });
		if ((init?.method ?? "GET") === "POST") return ok({});
		if (url.includes("effort_completed"))
			return ok([{ Story: { id: "12", effort_completed: "2" } }]);
		return ok([
			{
				Story: {
					id: "12",
					name: "测试子",
					parent_id: "1",
					owner: "me",
					workitem_type_id: "test",
					effort: "2",
				},
			},
		]);
	});
	const lines = await updateStoryForMergeRequest(config, object, () => {});
	assert.match(lines[0] ?? "", /测试需求/);
});

test("updateStoryForMergeRequest skips unowned test stories", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("/workitem_types"))
			return ok([
				{ WorkitemType: { id: "dev", name: "开发子需求", english_name: "development" } },
				{ WorkitemType: { id: "test", name: "测试需求", english_name: "test" } },
			]);
		if (url.includes("/users/info")) return ok({ nick: "me" });
		return ok([
			{
				Story: {
					id: "12",
					name: "测试子",
					parent_id: "1",
					owner: "other",
					workitem_type_id: "test",
				},
			},
		]);
	});
	assert.match(
		(await updateStoryForMergeRequest(config, object))[0] ?? "",
		/处理人不是当前用户/,
	);
});

test("updateStoryForMergeRequest skips unknown child kinds", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("/workitem_types"))
			return ok([
				{ WorkitemType: { id: "dev", name: "开发子需求", english_name: "development" } },
			]);
		return ok([
			{
				Story: {
					id: "12",
					name: "其它",
					parent_id: "1",
					workitem_type_id: "other",
				},
			},
		]);
	});
	assert.match(
		(await updateStoryForMergeRequest(config, object))[0] ?? "",
		/非开发或测试需求/,
	);
});

test("draft MR reports when no owned development children exist", async (t) => {
	const progress: string[] = [];
	t.mock.method(globalThis, "fetch", async (input: string | URL) => {
		const url = String(input);
		if (url.includes("/users/info")) return ok({ nick: "me" });
		if (url.includes("/workitem_types"))
			return ok([
				{ WorkitemType: { id: "dev", name: "开发子需求", english_name: "development" } },
			]);
		if (url.includes("parent_id=")) return ok([]);
		return ok([
			{
				Story: {
					id: "12",
					name: "登录",
					parent_id: "0",
					owner: "me",
					workitem_type_id: "func",
				},
			},
		]);
	});
	const lines = await updateStoryForDraftMergeRequest(config, object, (text) =>
		progress.push(text),
	);
	assert.ok(lines.some((line) => line.includes("没有处理人为当前用户的开发子需求")));
});

test("ready MR reports progress while completing an owned functional story", async (t) => {
	const progress: string[] = [];
	t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.includes("/users/info")) return ok({ nick: "me" });
		if (url.includes("/workitem_types"))
			return ok([
				{ WorkitemType: { id: "dev", name: "开发子需求", english_name: "development" } },
				{ WorkitemType: { id: "test", name: "测试需求", english_name: "test" } },
			]);
		if ((init?.method ?? "GET") === "POST") return ok({});
		if (url.includes("parent_id="))
			return ok([
				{
					Story: {
						id: "c1",
						name: "子开发",
						owner: "me",
						workitem_type_id: "dev",
						effort: "2",
					},
				},
			]);
		if (url.includes("effort_completed"))
			return ok([{ Story: { id: "c1", effort_completed: "2" } }]);
		return ok([
			{
				Story: {
					id: "12",
					name: "登录",
					parent_id: "0",
					owner: "me",
					workitem_type_id: "func",
				},
			},
		]);
	});
	const lines = await updateStoryForMergeRequest(config, object, (text) =>
		progress.push(text),
	);
	assert.ok(progress.some((line) => line.includes("功能需求处理人")));
	assert.ok(lines.some((line) => line.includes("功能需求")));
});

test("ready MR completes a functional story when the workspace has no test type", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.includes("/users/info")) return ok({ nick: "me" });
		if (url.includes("/workitem_types"))
			return ok([
				{ WorkitemType: { id: "dev", name: "开发子需求", english_name: "development" } },
			]);
		if ((init?.method ?? "GET") === "POST") return ok({});
		if (url.includes("parent_id=")) return ok([]);
		return ok([
			{
				Story: {
					id: "12",
					name: "登录",
					parent_id: "0",
					owner: "me",
					workitem_type_id: "func",
				},
			},
		]);
	});
	const lines = await updateStoryForMergeRequest(config, object);
	assert.ok(lines.some((line) => line.includes("功能需求")));
});


