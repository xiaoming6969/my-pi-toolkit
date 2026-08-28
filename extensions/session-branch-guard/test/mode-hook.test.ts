import assert from "node:assert/strict";
import test from "node:test";
import { createFakeContext } from "../../shared/test/fake-extension.ts";
import {
	notifySessionBranchModeChange,
	setSessionBranchModeHandler,
} from "../mode-hook.ts";

test("notifySessionBranchModeChange calls the registered handler", async () => {
	const seen: string[] = [];
	setSessionBranchModeHandler((mode, previous) => {
		seen.push(`${previous}->${mode}`);
	});
	notifySessionBranchModeChange("build", "ask", createFakeContext());
	assert.deepEqual(seen, ["ask->build"]);
	setSessionBranchModeHandler(undefined);
	notifySessionBranchModeChange("debug", "plan", createFakeContext());
	assert.deepEqual(seen, ["ask->build"]);
});
