import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { isPlanFilePath, isProjectPiPath } from "../paths.ts";
import {
	readPlanFile,
	seedPlanFile,
	sessionPlanFile,
} from "../plan-file.ts";

test("sessionPlanFile rejects unsafe ids and seeds without truncating", async (t) => {
	assert.throws(() => sessionPlanFile("/tmp", "../escape"), /Invalid session id/);
	const root = await mkdtemp(join(tmpdir(), "chat-plan-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const plan = sessionPlanFile(root, "session-1");
	assert.equal(plan.absolutePath, join(root, "session-1", "plan.md"));
	assert.equal(await seedPlanFile(plan), "created");
	assert.equal(await readPlanFile(plan), undefined);
	assert.equal(await seedPlanFile(plan), "empty");
	await writeFile(plan.absolutePath, "# keep\n");
	assert.equal(await seedPlanFile(plan), "nonempty");
	assert.equal(await readPlanFile(plan), "# keep\n");
});

test("Ask/Plan path gates recognize .pi files and the active plan", async (t) => {
	const cwd = await mkdtemp(join(tmpdir(), "chat-paths-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	await mkdir(join(cwd, CONFIG_DIR_NAME, "docs"), { recursive: true });
	await writeFile(join(cwd, CONFIG_DIR_NAME, "docs", "note.md"), "x");
	const planPath = join(cwd, CONFIG_DIR_NAME, "docs", "plan.md");
	await writeFile(planPath, "plan");

	assert.equal(await isProjectPiPath(cwd, join(CONFIG_DIR_NAME, "docs", "note.md")), true);
	assert.equal(await isProjectPiPath(cwd, "src/a.ts"), false);
	assert.equal(await isPlanFilePath(cwd, planPath, undefined), false);
	assert.equal(await isPlanFilePath(cwd, planPath, planPath), true);
	assert.equal(
		await isPlanFilePath(cwd, join(cwd, "other.md"), planPath),
		false,
	);
});
