import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { discoverDashboardData } from "../discovery.ts";

test("discoverDashboardData lists local AGENTS.md and project skills", async (t) => {
	const cwd = await mkdtemp(join(tmpdir(), "dashboard-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	await writeFile(join(cwd, "AGENTS.md"), "# agents\n");
	await mkdir(join(cwd, ".git"), { recursive: true });
	await mkdir(join(cwd, ".pi", "skills", "local-skill"), { recursive: true });
	await writeFile(
		join(cwd, ".pi", "skills", "local-skill", "SKILL.md"),
		"---\nname: local-skill\n---\n",
	);

	const data = await discoverDashboardData(cwd, false);
	assert.ok(data.contexts.includes("./AGENTS.md"));
	assert.ok(data.skills.includes("local-skill"));
	assert.ok(data.extensions.includes("ming-core"));
	assert.ok(data.extensions.includes("tapd"));
	assert.ok(!data.extensions.includes("startup-dashboard"));
	assert.ok(Array.isArray(data.themes));
});
