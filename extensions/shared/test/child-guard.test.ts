import assert from "node:assert/strict";
import test from "node:test";
import {
	assertNotSubagentChild,
	isSubagentChild,
	SUBAGENT_CHILD_ENV,
} from "../subagent/child-guard.ts";

test("isSubagentChild reads the child marker", () => {
	assert.equal(isSubagentChild({}), false);
	assert.equal(isSubagentChild({ [SUBAGENT_CHILD_ENV]: "0" }), false);
	assert.equal(isSubagentChild({ [SUBAGENT_CHILD_ENV]: "1" }), true);
});

test("assertNotSubagentChild throws only inside a child process", (t) => {
	const previous = process.env[SUBAGENT_CHILD_ENV];
	t.after(() => {
		if (previous === undefined) delete process.env[SUBAGENT_CHILD_ENV];
		else process.env[SUBAGENT_CHILD_ENV] = previous;
	});
	delete process.env[SUBAGENT_CHILD_ENV];
	assert.doesNotThrow(() => assertNotSubagentChild("派生子 Agent"));
	process.env[SUBAGENT_CHILD_ENV] = "1";
	assert.throws(() => assertNotSubagentChild("派生子 Agent"), /嵌套深度上限为 1/);
});
