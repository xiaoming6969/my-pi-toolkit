import test from "node:test";
import assert from "node:assert/strict";
import { REVIEW_SYSTEM_PROMPT, buildReviewTask } from "../review/prompt.ts";
import {
	ROOT_CAUSE_SYSTEM_PROMPT,
	buildRootCauseTask,
} from "../git/root-cause-prompt.ts";

test("REVIEW_SYSTEM_PROMPT requires the TAPD report structure", () => {
	assert.match(REVIEW_SYSTEM_PROMPT, /# TAPD Code Review/);
	assert.match(REVIEW_SYSTEM_PROMPT, /Never modify files/);
	assert.match(REVIEW_SYSTEM_PROMPT, /P0 Blocker/);
});

test("buildReviewTask includes files, range, and extra instructions", () => {
	const uncommitted = buildReviewTask({
		storyId: "12",
		storyName: "登录",
		understandingFile: "/tmp/understanding.md",
		designFile: "/tmp/design.md",
		repositoryRoot: "/tmp/repo",
		branch: "feature",
		scope: "uncommitted",
		comparisonRef: "HEAD",
		changedFiles: ["a.ts"],
		contextFile: "/tmp/context.diff",
		cleanup: async () => {},
	});
	assert.match(uncommitted, /story 12: 登录/);
	assert.match(uncommitted, /\/tmp\/understanding\.md/);
	assert.match(uncommitted, /HEAD through the current working tree/);
	assert.doesNotMatch(uncommitted, /Additional user instructions/);

	const branched = buildReviewTask(
		{
			storyId: "12",
			storyName: "登录",
			understandingFile: "/tmp/understanding.md",
			designFile: "/tmp/design.md",
			repositoryRoot: "/tmp/repo",
			branch: "feature",
			scope: "branch",
			baseRef: "origin/dev",
			mergeBase: "abc",
			comparisonRef: "abc",
			changedFiles: [],
			contextFile: "/tmp/context.diff",
			cleanup: async () => {},
		},
		"focus on auth",
	);
	assert.match(branched, /merge-base abc of origin\/dev/);
	assert.match(branched, /Additional user instructions/);
	assert.match(branched, /focus on auth/);
});

test("root-cause prompt asks the subagent to locate the introducing commit", () => {
	assert.match(ROOT_CAUSE_SYSTEM_PROMPT, /【根因分析（RCA）】/);
	assert.match(ROOT_CAUSE_SYSTEM_PROMPT, /【影响范围】/);
	assert.match(ROOT_CAUSE_SYSTEM_PROMPT, /【修复方案说明】/);
	assert.match(ROOT_CAUSE_SYSTEM_PROMPT, /【引入commit】/);
	assert.match(ROOT_CAUSE_SYSTEM_PROMPT, /【根因大类】/);
	assert.match(ROOT_CAUSE_SYSTEM_PROMPT, /自行定位/);
	const task = buildRootCauseTask({
		bugId: "8",
		workspaceId: "99",
		evidenceFile: "/tmp/evidence.md",
		targetBranch: "dev",
	});
	assert.match(task, /Bug 8/);
	assert.match(task, /origin\/dev/);
	assert.match(task, /不要使用任何预先提供的候选列表或已确认 hash/);
	assert.match(task, /【影响范围】/);
	assert.doesNotMatch(task, /已确认的引入 commit/);
});
