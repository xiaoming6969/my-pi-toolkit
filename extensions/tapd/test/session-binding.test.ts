import assert from "node:assert/strict";
import test from "node:test";
import {
	TAPD_SESSION_STATE_TYPE,
	type TapdSessionState,
} from "../sessions/session-state.ts";
import { syncSessionBinding } from "../git/session-binding.ts";
import { createBinding } from "../../session-branch-guard/binding.ts";
import { BINDING_ENTRY_TYPE } from "../../session-branch-guard/types.ts";
import {
	createFakeContext,
	createFakePi,
} from "../../shared/test/fake-extension.ts";

const state: TapdSessionState = {
	version: 1,
	workspaceId: "99",
	itemId: "12",
	kind: "story",
	itemName: "需求",
	createdAt: "t",
	updatedAt: "t",
};

test("syncSessionBinding no-ops without a binding or when the branch matches", async () => {
	const { pi, entries } = createFakePi();
	const empty = createFakeContext({ entries: [] });
	assert.equal(
		await syncSessionBinding(pi, empty, {
			repoRoot: "/repo",
			branch: "main",
		}),
		false,
	);

	const binding = createBinding(
		{ isRepo: true, repoRoot: "/repo", branch: "main", head: "abc" },
		"created",
	);
	const same = createFakeContext({
		entries: [
			{
				type: "custom",
				customType: BINDING_ENTRY_TYPE,
				data: binding,
			},
			{
				type: "custom",
				customType: TAPD_SESSION_STATE_TYPE,
				data: state,
			},
		],
	});
	assert.equal(
		await syncSessionBinding(pi, same, {
			repoRoot: "/repo",
			branch: "main",
			head: "abc",
		}),
		false,
	);
	assert.equal(entries.length, 0);
});

test("syncSessionBinding rebinds when the branch differs", async () => {
	const { pi, entries } = createFakePi();
	const binding = createBinding(
		{ isRepo: true, repoRoot: "/repo", branch: "main", head: "abc" },
		"created",
	);
	const ctx = createFakeContext({
		entries: [
			{
				type: "custom",
				customType: BINDING_ENTRY_TYPE,
				data: binding,
			},
		],
	});
	assert.equal(
		await syncSessionBinding(pi, ctx, {
			repoRoot: "/repo",
			branch: "feature",
			head: "def",
		}),
		true,
	);
	assert.equal(entries[0]?.type, BINDING_ENTRY_TYPE);
});
