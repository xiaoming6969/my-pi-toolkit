import assert from "node:assert/strict";
import test from "node:test";
import {
	formatBindingStatus,
	shouldBindOnInput,
	shouldCheckSession,
} from "../policy.ts";

test("shouldBindOnInput skips extension traffic and existing bindings", () => {
	assert.equal(shouldBindOnInput("interactive", false), true);
	assert.equal(shouldBindOnInput("rpc", false), true);
	assert.equal(shouldBindOnInput(undefined, false), true);
	assert.equal(shouldBindOnInput("extension", false), false);
	assert.equal(shouldBindOnInput("interactive", true), false);
});

test("shouldCheckSession only covers startup and resume", () => {
	assert.equal(shouldCheckSession("startup"), true);
	assert.equal(shouldCheckSession("resume"), true);
	assert.equal(shouldCheckSession("reload"), false);
	assert.equal(shouldCheckSession("new"), false);
	assert.equal(shouldCheckSession("fork"), false);
});

test("formatBindingStatus lists session, repo, and mismatch", () => {
	assert.match(
		formatBindingStatus({
			sessionId: "abc",
			binding: {
				version: 1,
				repoRoot: "/repo",
				gitBranch: "main",
				boundAt: "2026-01-01T00:00:00.000Z",
				source: "created",
			},
			gitContext: { isRepo: true, repoRoot: "/repo", branch: "dev" },
			mismatch: "branch-differs",
		}),
		/绑定分支：main[\s\S]*当前分支：dev[\s\S]*状态：分支不一致/,
	);
	assert.match(
		formatBindingStatus({
			gitContext: { isRepo: false },
			binding: undefined,
			mismatch: "same",
		}),
		/非 Git 仓库[\s\S]*未绑定[\s\S]*状态：一致/,
	);
	assert.match(
		formatBindingStatus({
			binding: {
				version: 1,
				repoRoot: "/repo",
				gitBranch: "main",
				boundAt: "2026-01-01T00:00:00.000Z",
				source: "created",
			},
			gitContext: { isRepo: true, repoRoot: "/other", branch: "main" },
			mismatch: "repo-differs",
		}),
		/仓库不一致/,
	);
	assert.match(
		formatBindingStatus({
			binding: {
				version: 1,
				repoRoot: "/repo",
				gitBranch: "main",
				boundAt: "2026-01-01T00:00:00.000Z",
				source: "created",
			},
			gitContext: { isRepo: true, repoRoot: "/repo" },
			mismatch: "detached",
		}),
		/当前 detached HEAD/,
	);
});
