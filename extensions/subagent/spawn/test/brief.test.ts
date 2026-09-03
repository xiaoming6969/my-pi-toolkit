import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	buildSubagentBrief,
	collectDeclaredOutputs,
	describeOutputs,
} from "../brief.ts";
import { describeRunResult } from "../result-text.ts";

test("a plain prompt stays a plain prompt", () => {
	assert.equal(buildSubagentBrief({ prompt: "  Find the auth entry points.  " }), "Find the auth entry points.");
	assert.equal(
		buildSubagentBrief({ prompt: "x", relevantFiles: [" ", ""], constraints: [], expectedOutput: "  " }),
		"x",
	);
});

test("structured sections render in a stable order", () => {
	const brief = buildSubagentBrief({
		prompt: "Trace login.",
		relevantFiles: ["src/auth/", " src/api/login.ts "],
		constraints: ["Do not modify files"],
		expectedOutput: "Markdown with file:line evidence",
		outputs: [
			{ name: "plan.md", description: "The plan", required: true },
			{ name: "notes.md", description: "", required: false },
		],
		outputsDir: "/tmp/run/outputs",
		resumedFrom: "abc",
	});
	assert.equal(
		brief,
		[
			"Trace login.",
			"Relevant files:\n- src/auth/\n- src/api/login.ts",
			"Constraints:\n- Do not modify files",
			"Expected output:\nMarkdown with file:line evidence",
			"Output files (write each to the exact path; the parent reads them after you finish):\n- /tmp/run/outputs/plan.md (required): The plan\n- /tmp/run/outputs/notes.md",
			"This conversation continues the transcript of subagent abc; build on its findings instead of re-discovering them.",
		].join("\n\n"),
	);
});

test("declared outputs are collected from disk and described", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "brief-outputs-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	await writeFile(join(dir, "plan.md"), "plan");
	const outputs = collectDeclaredOutputs(
		[
			{ name: "plan.md", description: "", required: true },
			{ name: "notes.md", description: "", required: true },
			{ name: "extra.md", description: "", required: false },
		],
		dir,
	);
	assert.deepEqual(
		outputs.map((output) => [output.name, output.exists]),
		[
			["plan.md", true],
			["notes.md", false],
			["extra.md", false],
		],
	);
	assert.equal(
		describeOutputs(outputs),
		`\n\nOutput files:\n- plan.md: ${join(dir, "plan.md")}\n- notes.md: missing (required)\n- extra.md: missing`,
	);
	assert.equal(describeOutputs([]), "");
});

test("describeRunResult appends report path only when truncated, plus outputs and handle", () => {
	const base = {
		model: "m",
		toolCalls: [],
		exitCode: 0,
		stderr: "",
	};
	assert.equal(
		describeRunResult({
			...base,
			output: "short",
			reusable: true,
			subagentId: "id-1",
			turn: 1,
			artifacts: {
				reportFile: "/r/report.md",
				outputs: [{ name: "a.md", path: "/r/outputs/a.md", exists: true, required: false }],
			},
		}),
		"short\n\nOutput files:\n- a.md: /r/outputs/a.md\n\nReusable subagentId: id-1 (turn 1).",
	);
	const long = Array.from({ length: 2500 }, (_, i) => `line ${i}`).join("\n");
	const text = describeRunResult({
		...base,
		output: long,
		reusable: false,
		turn: 1,
		artifacts: { reportFile: "/r/report.md", outputs: [] },
	});
	assert.match(text, /已截断/);
	assert.ok(text.endsWith("\n\nFull report: /r/report.md"));
	assert.equal(describeRunResult({ ...base, output: "bare", reusable: false, turn: 1 }), "bare");
});
