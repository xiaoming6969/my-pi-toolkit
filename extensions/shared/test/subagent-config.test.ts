import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
	loadSubagentUiConfig,
	resolvePresentation,
	type SubagentUiConfig,
} from "../subagent/config.ts";
import { withTempAgentDir } from "./fake-extension.ts";

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

test("loadSubagentUiConfig reads presentation, fallback, and terminal settings", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		assert.equal(loadSubagentUiConfig().presentation, "manual");
		await writeFile(
			join(dir, "ming-core.json"),
			JSON.stringify({
				subagents: {
					presentation: "split",
					fallback: "error",
					keepOpen: false,
					retainCompletedMinutes: 3,
					windowsTerminal: { size: 0.9, shell: "bash.exe" },
				},
			}),
		);
		const loaded = loadSubagentUiConfig();
		assert.equal(loaded.presentation, "split");
		assert.equal(loaded.fallback, "error");
		assert.equal(loaded.keepOpen, false);
		assert.equal(loaded.retainCompletedMinutes, 3);
		assert.equal(loaded.windowsTerminal.size, 0.8);
		assert.equal(loaded.windowsTerminal.shell, "bash.exe");
		assert.equal(loadSubagentUiConfig("tab").presentation, "tab");
	});
});

test("loadSubagentUiConfig imports legacy subagents.json", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		await writeFile(
			join(dir, "subagents.json"),
			JSON.stringify({ presentation: "inline", keepOpen: false }),
		);
		const loaded = loadSubagentUiConfig();
		assert.equal(loaded.presentation, "inline");
		assert.equal(loaded.keepOpen, false);
	});
});

test("loadSubagentUiConfig rejects invalid JSON objects", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		await writeFile(join(dir, "ming-core.json"), "[]");
		assert.throws(() => loadSubagentUiConfig(), /必须是 JSON 对象/);
		await writeFile(join(dir, "ming-core.json"), "null");
		assert.throws(() => loadSubagentUiConfig(), /必须是 JSON 对象/);
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "ming-core.json"),
			JSON.stringify({ subagents: { presentation: "nope" } }),
		);
		assert.throws(() => loadSubagentUiConfig(), /presentation 必须是/);
		await writeFile(
			join(dir, "ming-core.json"),
			JSON.stringify({ subagents: [] }),
		);
		assert.throws(() => loadSubagentUiConfig(), /subagents 必须是 JSON 对象/);
	});
});
