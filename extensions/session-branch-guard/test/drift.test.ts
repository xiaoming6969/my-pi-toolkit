import assert from "node:assert/strict";
import test from "node:test";
import { createBinding } from "../binding.ts";
import {
	followBindingIfBranchDiffers,
	guardStateLabel,
	liveDriftDecision,
} from "../drift.ts";
import { BINDING_ENTRY_TYPE } from "../types.ts";
import { createFakePi } from "../../shared/test/fake-extension.ts";

const binding = createBinding(
	{ isRepo: true, repoRoot: "/repo", branch: "main", head: "abc" },
	"created",
);

test("liveDriftDecision follows same-repo branch changes after agent_settled", () => {
	const settled = {
		restrictedMode: false,
		hasUI: true,
		hardBlocked: false,
		source: "settled" as const,
	};
	assert.equal(liveDriftDecision("same", settled), "none");
	assert.equal(liveDriftDecision("branch-differs", settled), "follow");
	assert.equal(liveDriftDecision("repo-differs", settled), "none");
	assert.equal(liveDriftDecision("detached", settled), "none");
});

test("liveDriftDecision advises in restricted mode and blocks Build or hard state", () => {
	const input = {
		restrictedMode: true,
		hasUI: true,
		hardBlocked: false,
		source: "input" as const,
	};
	assert.equal(liveDriftDecision("same", input), "none");
	assert.equal(liveDriftDecision("branch-differs", input), "advise");
	assert.equal(
		liveDriftDecision("branch-differs", { ...input, restrictedMode: false }),
		"block",
	);
	assert.equal(
		liveDriftDecision("branch-differs", { ...input, hardBlocked: true }),
		"block",
	);
	assert.equal(liveDriftDecision("repo-differs", input), "block");
	assert.equal(liveDriftDecision("detached", input), "block");
	assert.equal(
		liveDriftDecision("branch-differs", { ...input, hasUI: false }),
		"block",
	);
});

test("followBindingIfBranchDiffers only writes on same-repo branch drift", () => {
	const { pi, entries } = createFakePi();
	assert.equal(
		followBindingIfBranchDiffers(pi, undefined, {
			isRepo: true,
			repoRoot: "/repo",
			branch: "dev",
		}),
		false,
	);
	assert.equal(
		followBindingIfBranchDiffers(pi, binding, {
			isRepo: true,
			repoRoot: "/repo",
			branch: "main",
			head: "abc",
		}),
		false,
	);
	assert.equal(
		followBindingIfBranchDiffers(pi, binding, {
			isRepo: true,
			repoRoot: "/other",
			branch: "dev",
		}),
		false,
	);
	assert.equal(
		followBindingIfBranchDiffers(pi, binding, {
			isRepo: true,
			repoRoot: "/repo",
		}),
		false,
	);
	assert.equal(entries.length, 0);
	assert.equal(
		followBindingIfBranchDiffers(pi, binding, {
			isRepo: true,
			repoRoot: "/repo",
			branch: "dev",
			head: "def",
		}),
		true,
	);
	assert.equal(entries[0]?.type, BINDING_ENTRY_TYPE);
	assert.equal(
		(entries[0]?.data as { gitBranch?: string; source?: string }).gitBranch,
		"dev",
	);
	assert.equal(
		(entries[0]?.data as { source?: string }).source,
		"rebound",
	);
});

test("guardStateLabel names each live state", () => {
	assert.equal(guardStateLabel("clear"), "正常");
	assert.equal(guardStateLabel("advisory"), "提示中（分支不匹配）");
	assert.equal(guardStateLabel("hard"), "已阻塞（分支不匹配）");
});
