import assert from "node:assert/strict";
import test from "node:test";
import { EXIT_PLAN_TOOL } from "../plan-file.ts";
import {
	debugModePrompt,
	debugReproducedMessage,
	planFileStructure,
	planReminderText,
} from "../prompt.ts";

test("planReminderText switches full, sparse, reentry, and exit copy", () => {
	assert.match(planReminderText("exit", "plan.md", false), /exited plan mode/);
	assert.match(planReminderText("sparse", "plan.md", true), /still active/);
	const reentry = planReminderText("reentry", "/tmp/plan.md", true);
	assert.match(reentry, /\/tmp\/plan\.md/);
	assert.match(reentry, new RegExp(EXIT_PLAN_TOOL));
	assert.match(planReminderText("full", "plan.md", false), /No plan written yet/);
	assert.match(planReminderText("full", "plan.md", true), /A plan file exists/);
	assert.match(planFileStructure("plan.md"), /## Context/);
});

test("debug prompts include the collector endpoint and log path", () => {
	assert.match(debugModePrompt("http://127.0.0.1:9", "/tmp/debug.jsonl"), /http:\/\/127\.0\.0\.1:9/);
	assert.match(debugReproducedMessage("/tmp/debug.jsonl"), /\/tmp\/debug\.jsonl/);
});
