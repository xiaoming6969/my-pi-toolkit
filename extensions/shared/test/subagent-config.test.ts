import assert from "node:assert/strict";
import test from "node:test";
import { resolvePresentation, type SubagentUiConfig } from "../subagent/config.ts";

const base: SubagentUiConfig = {
	presentation: "manual",
	fallback: "inline",
	keepOpen: true,
	retainCompletedMinutes: 60,
	windowsTerminal: { size: 0.45, shell: "pwsh.exe" },
};

test("resolvePresentation keeps explicit modes and maps auto off Windows Terminal", () => {
	assert.equal(resolvePresentation({ ...base, presentation: "split" }), "split");
	assert.equal(resolvePresentation({ ...base, presentation: "tab" }), "tab");
	assert.equal(resolvePresentation({ ...base, presentation: "inline" }), "inline");
	assert.equal(resolvePresentation({ ...base, presentation: "auto" }), "inline");
});
