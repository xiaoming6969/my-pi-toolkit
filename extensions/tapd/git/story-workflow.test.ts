import assert from "node:assert/strict";
import test from "node:test";
import { functionalStoryStatus } from "./story-status.ts";

const child = (owner: string, type: string, status: string) => ({
	id: `${owner}-${type}`,
	name: "child",
	owner,
	workitem_type_id: type,
	v_status: status,
});

test("functional story stays in progress while another owner's child is unfinished", () => {
	assert.equal(
		functionalStoryStatus([child("other", "dev", "实现中")], "me", "dev", "test"),
		"实现中",
	);
	assert.equal(
		functionalStoryStatus([child("other", "dev", "开发完成")], "me", "dev", "test"),
		"开发完成",
	);
	assert.equal(
		functionalStoryStatus([child("me", "test", "测试中")], "me", "dev", "test"),
		"开发完成",
	);
});
