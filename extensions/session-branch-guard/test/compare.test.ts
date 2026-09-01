import assert from "node:assert/strict";
import test from "node:test";
import { compareBinding } from "../compare.ts";

const binding = {
	version: 1 as const,
	repoRoot: "/repo",
	gitBranch: "main",
	gitCommonDir: "/repo/.git",
	boundAt: "2026-01-01T00:00:00.000Z",
	source: "created" as const,
};

test("compareBinding reports repo, branch, and detached mismatches", () => {
	assert.equal(
		compareBinding(undefined, { isRepo: true, repoRoot: "/repo", branch: "main" }),
		"same",
	);
	assert.equal(compareBinding(binding, { isRepo: false }), "same");
	assert.equal(compareBinding(binding, { isRepo: true }), "same");
	assert.equal(
		compareBinding(binding, {
			isRepo: true,
			repoRoot: "/other",
			gitCommonDir: "/other/.git",
			branch: "main",
		}),
		"repo-differs",
	);
	assert.equal(
		compareBinding(binding, {
			isRepo: true,
			repoRoot: "/other",
			branch: "main",
		}),
		"repo-differs",
	);
	assert.equal(
		compareBinding(binding, { isRepo: true, repoRoot: "/repo" }),
		"detached",
	);
	assert.equal(
		compareBinding(binding, { isRepo: true, repoRoot: "/repo", branch: "dev" }),
		"branch-differs",
	);
	assert.equal(
		compareBinding(binding, { isRepo: true, repoRoot: "/repo", branch: "main" }),
		"same",
	);
});

test("compareBinding treats worktrees with the same git common dir as one repo", () => {
	assert.equal(
		compareBinding(binding, {
			isRepo: true,
			repoRoot: "/repo/.pi/worktrees/feature",
			gitCommonDir: "/repo/.git",
			branch: "feature",
		}),
		"branch-differs",
	);
	assert.equal(
		compareBinding(binding, {
			isRepo: true,
			repoRoot: "/repo/.pi/worktrees/feature",
			gitCommonDir: "/repo/.git",
			branch: "main",
		}),
		"same",
	);
	assert.equal(
		compareBinding(
			{ ...binding, gitCommonDir: undefined },
			{
				isRepo: true,
				repoRoot: "/repo/.pi/worktrees/feature",
				gitCommonDir: "/repo/.git",
				branch: "main",
			},
		),
		"repo-differs",
	);
});
