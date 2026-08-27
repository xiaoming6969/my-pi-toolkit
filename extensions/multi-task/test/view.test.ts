import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { buildWorkerTask } from "../prompt.ts";
import {
	batchVisualStatus,
	collectText,
	progressDetails,
	progressText,
	snapshot,
	summarize,
	workerSummary,
} from "../view.ts";
import type { MultiTaskBatch } from "../types.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

function batch(): MultiTaskBatch {
	return {
		id: "b1",
		cwd: "/repo",
		model: "openai/gpt",
		thinkingLevel: "low",
		parentSessionId: "s1",
		status: "running",
		createdAt: "2026-01-01T00:00:00.000Z",
		maxConcurrency: 2,
		implementationTools: ["edit"],
		keepOpen: true,
		cancelRequested: false,
		workers: [
			{
				id: "w1",
				task: "implement",
				paths: ["src"],
				kind: "implementation",
				model: "openai/gpt",
				thinkingLevel: "low",
				status: "running",
				progress: "editing",
				toolCalls: [
					{ name: "read", arguments: { path: "src/a.ts" } },
					{ name: "edit", arguments: { path: "src/a.ts" } },
				],
				controller: new AbortController(),
				output: "done",
				subagentId: "abcdefghijkl",
				reusable: true,
				turn: 2,
			},
			{
				id: "w2",
				task: "research",
				paths: ["docs"],
				kind: "research",
				model: "openai/gpt",
				status: "queued",
				toolCalls: [],
				controller: new AbortController(),
			},
		],
	};
}

test("buildWorkerTask lists authorized write paths", () => {
	assert.match(buildWorkerTask("do work", ["src", "docs"]), /Authorized write paths:/);
	assert.match(buildWorkerTask("do work", ["src"]), /- src/);
});

test("snapshot and summaries describe worker progress without leaking output by default", () => {
	const view = snapshot(batch(), false);
	assert.equal(view.workers[0]?.output, undefined);
	assert.equal(snapshot(batch(), true).workers[0]?.output, "done");
	assert.match(summarize(view), /Batch b1: running \(running=1, queued=1\)/);
	assert.match(progressText(view), /w1 \[implementation\]: running → edit src\/a\.ts/);
	assert.equal(batchVisualStatus("running"), "active");
	assert.equal(batchVisualStatus("completed"), "success");
	assert.equal(batchVisualStatus("failed"), "error");
	assert.equal(workerSummary(undefined, "b1"), "b1");
	assert.equal(workerSummary(1, "b1"), "1 worker");
	assert.equal(workerSummary(2, "b1"), "2 workers");
	assert.match(progressDetails(view, theme, true).join("\n"), /#abcdefgh/);
	const collected = collectText(snapshot(batch(), true));
	assert.match(collected, /Reusable subagentId: abcdefghijkl/);
	assert.match(collected, /## w1 · implementation · running/);
});
