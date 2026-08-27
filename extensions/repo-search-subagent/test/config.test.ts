import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { projectConfigPath } from "../config.ts";

test("projectConfigPath walks up to repo-search-subagent.json", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "repo-search-cfg-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const nested = join(root, "pkg");
	await mkdir(nested, { recursive: true });
	assert.equal(
		projectConfigPath(nested),
		join(nested, CONFIG_DIR_NAME, "repo-search-subagent.json"),
	);
	const configPath = join(root, CONFIG_DIR_NAME, "repo-search-subagent.json");
	await mkdir(join(root, CONFIG_DIR_NAME), { recursive: true });
	await writeFile(configPath, '{ "model": "openai/gpt" }\n');
	assert.equal(projectConfigPath(nested), configPath);
});
