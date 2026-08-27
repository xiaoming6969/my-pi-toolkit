import test from "node:test";
import assert from "node:assert/strict";
import { tapdArgumentCompletions } from "../command-completions.ts";

test("tapdArgumentCompletions filters commands and preview documents", () => {
	assert.deepEqual(
		tapdArgumentCompletions("bu")?.map((item) => item.value),
		["bug", "bug-reject"],
	);
	assert.equal(tapdArgumentCompletions("zzz"), null);
	assert.deepEqual(
		tapdArgumentCompletions("preview d")?.map((item) => item.label),
		["design"],
	);
	assert.equal(tapdArgumentCompletions("preview nope"), null);
	assert.ok(
		(tapdArgumentCompletions("")?.length ?? 0) > 0,
		"empty prefix lists all commands",
	);
});
