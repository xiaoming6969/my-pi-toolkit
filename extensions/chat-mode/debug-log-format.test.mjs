import assert from "node:assert/strict";
import test from "node:test";
import { formatDebugLogLines } from "./debug-log-format.ts";

test("formats reproduction steps as complete numbered Chinese lines", () => {
	assert.deepEqual(
		formatDebugLogLines(
			JSON.stringify({
				type: "reproduction_steps",
				steps: [
					"打开 Debug Logs 面板",
					"运行 node scripts/debug-mode-playground.mjs 并观察完整错误",
				],
			}),
		),
		[
			"复现步骤",
			"1. 打开 Debug Logs 面板",
			"2. 运行 node scripts/debug-mode-playground.mjs 并观察完整错误",
		],
	);
});

test("keeps ordinary logs and removes terminal controls", () => {
	assert.deepEqual(formatDebugLogLines("\u001b[31mfailed\u001b[0m"), ["failed"]);
});
