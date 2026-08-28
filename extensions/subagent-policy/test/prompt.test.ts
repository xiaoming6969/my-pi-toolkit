import assert from "node:assert/strict";
import test from "node:test";
import {
	SUBAGENT_POLICY_PROMPT,
	appendSubagentPolicy,
} from "../prompt.ts";
import subagentPolicyExtension from "../index.ts";
import { createFakePi } from "../../shared/test/fake-extension.ts";

test("appendSubagentPolicy skips when subagent is unavailable", () => {
	assert.equal(appendSubagentPolicy("base", []), undefined);
	assert.equal(appendSubagentPolicy("base", ["read", "grep"]), undefined);
});

test("appendSubagentPolicy appends routing rules when subagent is active", () => {
	const next = appendSubagentPolicy("base prompt", ["read", "subagent"]);
	assert.match(next ?? "", /^base prompt\n\n/);
	assert.match(next ?? "", /必须\*\*先委派 `scout`/);
	assert.match(next ?? "", /影响面/);
	assert.match(next ?? "", /AGENTS\.md/);
	assert.match(next ?? "", /reviewer/);
	assert.match(next ?? "", /Context7/);
	assert.match(next ?? "", /workflowScript/);
	assert.equal(next, `base prompt\n\n${SUBAGENT_POLICY_PROMPT}`);
});

test("subagentPolicyExtension injects the prompt only when subagent is active", async () => {
	const { pi, events } = createFakePi();
	subagentPolicyExtension(pi);
	const handlers = events.get("before_agent_start") ?? [];
	assert.equal(handlers.length, 1);
	pi.setActiveTools(["read", "grep"]);
	assert.equal(
		await handlers[0]?.({ systemPrompt: "hello" }, {} as never),
		undefined,
	);
	pi.setActiveTools(["read", "subagent"]);
	const result = await handlers[0]?.({ systemPrompt: "hello" }, {} as never);
	assert.equal(
		(result as { systemPrompt?: string } | undefined)?.systemPrompt,
		`hello\n\n${SUBAGENT_POLICY_PROMPT}`,
	);
});
