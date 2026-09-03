import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareTaskArtifacts, SUBAGENT_RUNS_ROOT } from "../subagent/run-paths.ts";

test("SUBAGENT_RUNS_ROOT lives under the system temp directory", () => {
	assert.ok(SUBAGENT_RUNS_ROOT.startsWith(tmpdir()));
});

test("prepareTaskArtifacts copies files into the run dir and rewrites the task", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "run-paths-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const evidence = join(dir, "evidence.md");
	await writeFile(evidence, "facts");
	const runDir = join(dir, "run");
	const task = await prepareTaskArtifacts(
		runDir,
		`Read ${evidence} twice: ${evidence}`,
		[evidence],
	);
	const copied = join(runDir, "artifacts", "1-evidence.md");
	assert.equal(task, `Read ${copied} twice: ${copied}`);
	assert.equal(await readFile(copied, "utf8"), "facts");
	assert.equal(await prepareTaskArtifacts(runDir, "plain", []), "plain");
});
