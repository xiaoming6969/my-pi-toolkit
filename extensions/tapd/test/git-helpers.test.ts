import assert from "node:assert/strict";
import test from "node:test";
import { branchPrefix, commitPrefix } from "../git/policy.ts";
import { functionalStoryStatus, isOwnedBy } from "../git/story-status.ts";
import { parseGitLabProject } from "../git/gitlab-api.ts";
import { parseKeyword, parseTapdKeywords } from "../git/context.ts";
import { matchCategoryOption, tapdUserChooser } from "../git/bug-fields.ts";

const child = (owner: string, type: string, status: string) => ({
	id: `${owner}-${type}`,
	name: "child",
	owner,
	workitem_type_id: type,
	v_status: status,
});

test("branch and commit prefixes follow TAPD kind", () => {
	assert.equal(branchPrefix("bug"), "bug");
	assert.equal(branchPrefix("story"), "feature");
	assert.equal(commitPrefix("bug"), "fix");
	assert.equal(commitPrefix("task"), "feat");
});

test("isOwnedBy splits TAPD multi-owner fields", () => {
	assert.equal(isOwnedBy("me; other", "me"), true);
	assert.equal(isOwnedBy("other，me", "me"), true);
	assert.equal(isOwnedBy("other", "me"), false);
	assert.equal(isOwnedBy(undefined, "me"), false);
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

test("parseGitLabProject reads ssh and https remotes", () => {
	assert.deepEqual(parseGitLabProject("git@gitlab.example.com:group/app.git"), {
		apiBase: "https://gitlab.example.com/api/v4",
		projectPath: "group/app",
	});
	assert.deepEqual(
		parseGitLabProject("https://gitlab.example.com/group/app.git", {
			baseUrl: "https://gitlab.example.com/api/v4/",
		}),
		{
			apiBase: "https://gitlab.example.com/api/v4",
			projectPath: "group/app",
		},
	);
	assert.throws(() => parseGitLabProject("not-a-remote"), /无法从 origin URL 解析/);
});

test("parseTapdKeywords extracts story/task/bug markers", () => {
	const subject =
		"feat: work --story=12@tapd-99 --user=alice --bug=8@tapd-99";
	assert.deepEqual(parseTapdKeywords(subject), [
		{
			kind: "story",
			shortId: "12",
			objectId: "12",
			workspaceId: "99",
			keyword: subject,
			author: "alice",
		},
		{
			kind: "bug",
			shortId: "8",
			objectId: "8",
			workspaceId: "99",
			keyword: subject,
			author: "alice",
		},
	]);
	assert.equal(
		parseKeyword("--story=12@tapd-99", {
			workspaceId: "99",
			objectId: "real-id",
			kind: "story",
			name: "需求",
		}).objectId,
		"real-id",
	);
	assert.throws(() => parseKeyword("plain", {
		workspaceId: "99",
		objectId: "1",
		kind: "story",
	}), /未返回可识别/);
});

test("matchCategoryOption and tapdUserChooser normalize TAPD field values", () => {
	const leaves = [
		{ label: "前端 / 交互", value: "前端/交互", path: ["前端", "交互"] },
		{ label: "后端 / 接口", value: "后端/接口", path: ["后端", "接口"] },
	];
	assert.equal(matchCategoryOption("前端 / 交互", leaves), "前端/交互");
	assert.equal(matchCategoryOption("交互", leaves), "前端/交互");
	assert.equal(matchCategoryOption("未能确定", leaves), undefined);
	assert.equal(tapdUserChooser("alice"), "alice;");
	assert.equal(tapdUserChooser("alice;"), "alice;");
	assert.equal(tapdUserChooser("  "), "");
});
