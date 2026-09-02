import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { withTempAgentDir } from "./fake-extension.ts";
import {
	projectSectionValue,
	projectToolkitConfigPath,
	readToolkitJsonFile,
	readUserToolkitConfig,
	updateUserToolkitConfig,
	userToolkitConfigPath,
} from "../toolkit-config.ts";

async function migratedBackups(dir: string, prefix: string): Promise<string[]> {
	const names = await readdir(dir);
	return names.filter(
		(name) => name.startsWith(`${prefix}.`) && name.endsWith(".migrated.bak"),
	);
}

test("readUserToolkitConfig merges missing sections from legacy files and archives them", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		await writeFile(
			join(dir, "ming-core.json"),
			JSON.stringify({ builtinToolStyle: "grok" }),
		);
		await writeFile(
			join(dir, "model-manager.json"),
			JSON.stringify({
				newConversation: { enabled: false, model: "openai/gpt" },
			}),
		);
		await writeFile(
			join(dir, "repo-search-subagent.json"),
			JSON.stringify({ model: "cursor/fast", presentation: "manual" }),
		);
		await writeFile(
			join(dir, "subagents.json"),
			JSON.stringify({ keepOpen: false }),
		);

		const config = readUserToolkitConfig();
		assert.equal(config.builtinToolStyle, "grok");
		assert.deepEqual(config.newConversation, {
			enabled: false,
			model: "openai/gpt",
		});
		assert.deepEqual(config.repoSearch, {
			model: "cursor/fast",
			presentation: "manual",
		});
		assert.deepEqual(config.subagents, { keepOpen: false });

		assert.equal(existsSync(join(dir, "model-manager.json")), false);
		assert.equal(existsSync(join(dir, "repo-search-subagent.json")), false);
		assert.equal(existsSync(join(dir, "subagents.json")), false);
		assert.equal((await migratedBackups(dir, "model-manager.json")).length, 1);
		assert.equal(
			(await migratedBackups(dir, "repo-search-subagent.json")).length,
			1,
		);
		assert.equal((await migratedBackups(dir, "subagents.json")).length, 1);

		const written = JSON.parse(
			await readFile(userToolkitConfigPath(), "utf8"),
		) as Record<string, unknown>;
		assert.equal(written.builtinToolStyle, "grok");
		assert.deepEqual(written.newConversation, config.newConversation);
	});
});

test("readUserToolkitConfig does not write when there is nothing to import", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		assert.deepEqual(readUserToolkitConfig(), {});
		assert.equal(existsSync(join(dir, "ming-core.json")), false);
		assert.equal(readToolkitJsonFile(join(dir, "missing.json")), undefined);
	});
});

test("readUserToolkitConfig keeps existing sections and does not archive leftover legacy files", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		await writeFile(
			join(dir, "ming-core.json"),
			JSON.stringify({ newConversation: { model: "keep/me" } }),
		);
		await writeFile(
			join(dir, "model-manager.json"),
			JSON.stringify({ newConversation: { model: "ignore/me" } }),
		);
		const config = readUserToolkitConfig();
		assert.deepEqual(config.newConversation, { model: "keep/me" });
		assert.equal(existsSync(join(dir, "model-manager.json")), true);
		assert.equal((await migratedBackups(dir, "model-manager.json")).length, 0);
	});
});

test("readUserToolkitConfig ignores legacy model-manager.json without newConversation", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		await writeFile(join(dir, "model-manager.json"), JSON.stringify({}));
		assert.deepEqual(readUserToolkitConfig(), {});
		assert.equal(existsSync(join(dir, "model-manager.json")), true);
		assert.equal(existsSync(join(dir, "ming-core.json")), false);
	});
});

test("corrupt ming-core.json throws and does not archive legacy files", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		await writeFile(join(dir, "ming-core.json"), "{");
		await writeFile(
			join(dir, "model-manager.json"),
			JSON.stringify({ newConversation: { model: "openai/gpt" } }),
		);
		assert.throws(() => readUserToolkitConfig(), /无法解析/);
		assert.equal(existsSync(join(dir, "model-manager.json")), true);
		assert.equal((await migratedBackups(dir, "model-manager.json")).length, 0);
	});
});

test("invalid legacy file throws while falling back", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		await writeFile(join(dir, "model-manager.json"), "[]");
		assert.throws(() => readUserToolkitConfig(), /必须是 JSON 对象/);
		assert.equal(existsSync(join(dir, "ming-core.json")), false);
		assert.equal(existsSync(join(dir, "model-manager.json")), true);
	});
});

test("updateUserToolkitConfig patches without dropping other sections", async (t) => {
	await withTempAgentDir(t, async () => {
		await writeFile(
			userToolkitConfigPath(),
			JSON.stringify({
				builtinToolStyle: "grok",
				newConversation: { model: "openai/gpt" },
			}),
		);
		const path = updateUserToolkitConfig({ builtinToolStyle: "native" });
		assert.equal(path, userToolkitConfigPath());
		assert.deepEqual(readUserToolkitConfig(), {
			builtinToolStyle: "native",
			newConversation: { model: "openai/gpt" },
		});
	});
});

test("projectToolkitConfigPath prefers ming-core.json and does not write project files", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		const cwd = join(dir, "repo");
		const nested = join(cwd, "apps", "web");
		await mkdir(nested, { recursive: true });
		assert.equal(
			projectToolkitConfigPath(nested, "newConversation"),
			join(nested, CONFIG_DIR_NAME, "ming-core.json"),
		);

		const rootPi = join(cwd, CONFIG_DIR_NAME);
		await mkdir(rootPi, { recursive: true });
		const legacyPath = join(rootPi, "model-manager.json");
		await writeFile(
			legacyPath,
			JSON.stringify({ newConversation: { model: "legacy/model" } }),
		);
		assert.equal(projectToolkitConfigPath(nested, "newConversation"), legacyPath);

		const toolkitPath = join(rootPi, "ming-core.json");
		await writeFile(
			toolkitPath,
			JSON.stringify({ newConversation: { model: "toolkit/model" } }),
		);
		assert.equal(
			projectToolkitConfigPath(nested, "newConversation"),
			toolkitPath,
		);
		assert.equal(existsSync(legacyPath), true);

		const raw = readToolkitJsonFile(legacyPath);
		assert.deepEqual(projectSectionValue(raw ?? {}, legacyPath, "newConversation"), {
			model: "legacy/model",
		});
		assert.equal(
			JSON.parse(await readFile(legacyPath, "utf8")).newConversation.model,
			"legacy/model",
		);
	});
});

test("projectSectionValue unwraps legacy repo-search files", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		const legacyPath = join(dir, "repo-search-subagent.json");
		const toolkitPath = join(dir, "ming-core.json");
		const legacy = { model: "legacy/search" };
		const toolkit = { repoSearch: { model: "toolkit/search" } };
		assert.deepEqual(projectSectionValue(legacy, legacyPath, "repoSearch"), legacy);
		assert.deepEqual(
			projectSectionValue(toolkit, toolkitPath, "repoSearch"),
			toolkit.repoSearch,
		);
		assert.deepEqual(
			projectSectionValue(
				{ newConversation: { model: "x/y" } },
				toolkitPath,
				"newConversation",
			),
			{ model: "x/y" },
		);
	});
});
