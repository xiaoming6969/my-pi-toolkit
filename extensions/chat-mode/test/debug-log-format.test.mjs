import assert from "node:assert/strict";
import test from "node:test";
import {
	formatDebugLogLines,
	isReproductionStepsLine,
	latestReproductionStepsLine,
} from "../debug-log-format.ts";

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

test("latestReproductionStepsLine finds the last JSONL steps record", () => {
	const steps = JSON.stringify({ type: "reproduction_steps", steps: ["a"] });
	assert.equal(isReproductionStepsLine(steps), true);
	assert.equal(isReproductionStepsLine("not json"), false);
	assert.equal(
		latestReproductionStepsLine(`log\n${JSON.stringify({ type: "other" })}\n${steps}\n`),
		steps,
	);
	assert.equal(latestReproductionStepsLine("plain\n"), undefined);
});
