import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { projectConfigPath } from "../config.ts";

test("projectConfigPath walks up to ming-core.json or legacy repo-search file", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "repo-search-cfg-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const nested = join(root, "pkg");
	await mkdir(nested, { recursive: true });
	assert.equal(
		projectConfigPath(nested),
		join(nested, CONFIG_DIR_NAME, "ming-core.json"),
	);
	const legacyPath = join(root, CONFIG_DIR_NAME, "repo-search-subagent.json");
	await mkdir(join(root, CONFIG_DIR_NAME), { recursive: true });
	await writeFile(legacyPath, '{ "model": "openai/gpt" }\n');
	assert.equal(projectConfigPath(nested), legacyPath);

	const toolkitPath = join(root, CONFIG_DIR_NAME, "ming-core.json");
	await writeFile(toolkitPath, '{ "repoSearch": { "model": "openai/gpt" } }\n');
	assert.equal(projectConfigPath(nested), toolkitPath);
});
