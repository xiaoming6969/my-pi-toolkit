import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
import { checkAskToolCall, checkPlanToolCall } from "../policy.ts";

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
	assert.equal(await isPlanFilePath(cwd, join(cwd, "other.md"), planPath), false);
	assert.equal(await isProjectPiPath(cwd, `@${join(CONFIG_DIR_NAME, "docs", "note.md")}`), true);
	assert.equal(
		await isProjectPiPath(cwd, join(CONFIG_DIR_NAME, "docs", "brand-new.md")),
		true,
	);
	const missingPlan = join(cwd, CONFIG_DIR_NAME, "docs", "future-plan.md");
	assert.equal(await isPlanFilePath(cwd, missingPlan, missingPlan), true);

	assert.equal(
		await checkAskToolCall(
			{ toolName: "write", input: { path: join(CONFIG_DIR_NAME, "docs", "note.md") } },
			cwd,
		),
		undefined,
	);
	assert.equal(
		await checkPlanToolCall(
			{ toolName: "write", input: { path: planPath } },
			cwd,
			planPath,
		),
		undefined,
	);
	assert.equal(
		await checkPlanToolCall({ toolName: "read", input: {} }, cwd, planPath),
		undefined,
	);

	await writeFile(join(cwd, CONFIG_DIR_NAME, "docs", "file-as-dir.md"), "x");
	assert.equal(
		await isProjectPiPath(cwd, join(CONFIG_DIR_NAME, "docs", "file-as-dir.md", "nested.md")),
		true,
	);

	const loop = join(cwd, CONFIG_DIR_NAME, "loop");
	await symlink(loop, loop);
	await assert.rejects(() => isProjectPiPath(cwd, join(CONFIG_DIR_NAME, "loop")));
});

test("Ask path gates allow a missing .pi file and reject an escaped .pi root", async (t) => {
	const cwd = await mkdtemp(join(tmpdir(), "chat-paths-missing-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	assert.equal(
		await isProjectPiPath(cwd, join(CONFIG_DIR_NAME, "docs", "note.md")),
		true,
	);

	const escaped = await mkdtemp(join(tmpdir(), "chat-paths-escaped-"));
	t.after(() => rm(escaped, { recursive: true, force: true }));
	await symlink(escaped, join(cwd, CONFIG_DIR_NAME));
	assert.equal(
		await isProjectPiPath(cwd, join(CONFIG_DIR_NAME, "note.md")),
		false,
	);
});

test("seedPlanFile rejects symlinks and escaped plan directories", async (t) => {
	const { mkdir, symlink } = await import("node:fs/promises");
	const root = await mkdtemp(join(tmpdir(), "chat-plan-link-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const linked = sessionPlanFile(root, "session-link");
	await mkdir(join(root, "session-link"), { recursive: true });
	await symlink("/etc/passwd", linked.absolutePath);
	await assert.rejects(() => seedPlanFile(linked), /symbolic link/);

	const escaped = sessionPlanFile(root, "session-escape");
	await mkdir(escaped.sessionDir, { recursive: true });
	await symlink("/tmp", join(escaped.sessionDir, "session-escape"));
	await assert.rejects(() => seedPlanFile(escaped), /Unsafe Plan directory/);
});
