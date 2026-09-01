import assert from "node:assert/strict";
import test from "node:test";
import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { createFakePi } from "../../shared/test/fake-extension.ts";
import {
	appendBindingCurrent,
	appendBindingTarget,
	createBinding,
	isValidBinding,
	readBinding,
} from "../binding.ts";
import { BINDING_ENTRY_TYPE } from "../types.ts";

const binding = {
	version: 1 as const,
	repoRoot: "/repo",
	gitBranch: "main",
	boundAt: "2026-01-01T00:00:00.000Z",
	source: "created" as const,
};

test("isValidBinding and readBinding ignore damaged custom entries", () => {
	assert.equal(isValidBinding(null), false);
	assert.equal(isValidBinding({ ...binding, version: 2 }), false);
	assert.equal(isValidBinding({ ...binding, gitCommonDir: "" }), false);
	assert.equal(isValidBinding({ ...binding, gitCommonDir: 1 }), false);
	assert.equal(isValidBinding({ ...binding, source: "nope" }), false);
	assert.equal(isValidBinding(binding), true);
	assert.equal(
		isValidBinding({ ...binding, gitCommonDir: "/repo/.git" }),
		true,
	);
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
		{
			isRepo: true,
			repoRoot: "/repo",
			branch: "dev",
			head: "abc",
			gitCommonDir: "/repo/.git",
		},
		"adopted",
	);
	assert.equal(created.gitBranch, "dev");
	assert.equal(created.source, "adopted");
	assert.equal(created.head, "abc");
	assert.ok(created.gitCommonDir);
	assert.match(created.gitCommonDir, /[/\\]repo[/\\]\.git$/i);
	const withoutCommon = createBinding(
		{ isRepo: true, repoRoot: "/repo", branch: "main" },
		"created",
	);
	assert.equal(withoutCommon.gitCommonDir, undefined);
	assert.equal(readBinding([]), undefined);
});

test("appendBindingCurrent and appendBindingTarget write custom entries", () => {
	const fake = createFakePi();
	const value = createBinding(
		{ isRepo: true, repoRoot: "/repo", branch: "main" },
		"rebound",
	);
	appendBindingCurrent(fake.pi, value);
	assert.equal(fake.entries[0]?.type, BINDING_ENTRY_TYPE);
	assert.equal(
		(fake.entries[0]?.data as { gitBranch: string }).gitBranch,
		"main",
	);
	const recorded: Array<{ type: string; data: unknown }> = [];
	appendBindingTarget(
		{
			appendCustomEntry(type: string, data: unknown) {
				recorded.push({ type, data });
			},
		} as SessionManager,
		value,
	);
	assert.deepEqual(recorded, [{ type: BINDING_ENTRY_TYPE, data: value }]);
});
