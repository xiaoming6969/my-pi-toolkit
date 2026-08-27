import assert from "node:assert/strict";
import test from "node:test";
import { createBinding, isValidBinding, readBinding } from "../binding.ts";
import { compareBinding } from "../guard.ts";
import { BINDING_ENTRY_TYPE } from "../types.ts";

const binding = {
	version: 1 as const,
	repoRoot: "/repo",
	gitBranch: "main",
	boundAt: "2026-01-01T00:00:00.000Z",
	source: "created" as const,
};

test("compareBinding reports repo, branch, and detached mismatches", () => {
	assert.equal(compareBinding(undefined, { isRepo: true, repoRoot: "/repo", branch: "main" }), "same");
	assert.equal(compareBinding(binding, { isRepo: false }), "same");
	assert.equal(
		compareBinding(binding, { isRepo: true, repoRoot: "/other", branch: "main" }),
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

test("isValidBinding and readBinding ignore damaged custom entries", () => {
	assert.equal(isValidBinding(null), false);
	assert.equal(isValidBinding({ ...binding, version: 2 }), false);
	assert.equal(isValidBinding(binding), true);
	assert.equal(
		readBinding([
			{ type: "message" },
			{
				type: "custom",
				customType: BINDING_ENTRY_TYPE,
				data: { version: 1 },
			},
			{
				type: "custom",
				customType: BINDING_ENTRY_TYPE,
				data: binding,
			},
		] as never),
		binding,
	);
});

test("createBinding requires a git repo and named branch", () => {
	assert.throws(
		() => createBinding({ isRepo: false }, "created"),
		/无法在非 Git 仓库或 detached HEAD 上创建分支绑定/,
	);
	const created = createBinding(
		{ isRepo: true, repoRoot: "/repo", branch: "dev", head: "abc" },
		"adopted",
	);
	assert.equal(created.gitBranch, "dev");
	assert.equal(created.source, "adopted");
	assert.equal(created.head, "abc");
});
