import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { resolveRepoSearchConfig, userConfigPath } from "../config.ts";
import { withTempAgentDir } from "../../shared/test/fake-extension.ts";

test("resolveRepoSearchConfig prefers project, then user, then current model", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		const cwd = join(dir, "repo");
		await mkdir(cwd);
		assert.equal(
			resolveRepoSearchConfig(cwd, true, { provider: "openai", id: "gpt" })
				.source,
			"current",
		);
		await writeFile(
			userConfigPath(),
			JSON.stringify({
				repoSearch: { model: "user/model", presentation: "inline" },
			}),
		);
		assert.equal(
			resolveRepoSearchConfig(cwd, true, { provider: "openai", id: "gpt" })
				.source,
			"user",
		);
		await mkdir(join(cwd, CONFIG_DIR_NAME), { recursive: true });
		await writeFile(
			join(cwd, CONFIG_DIR_NAME, "ming-core.json"),
			JSON.stringify({ repoSearch: { model: "project/model" } }),
		);
		const project = resolveRepoSearchConfig(cwd, true, {
			provider: "openai",
			id: "gpt",
		});
		assert.equal(project.source, "project");
		assert.equal(project.model, "project/model");
		assert.equal(
			resolveRepoSearchConfig(cwd, false, { provider: "openai", id: "gpt" })
				.source,
			"user",
		);
	});
});

test("resolveRepoSearchConfig reads legacy project repo-search-subagent.json", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		const cwd = join(dir, "repo");
		await mkdir(join(cwd, CONFIG_DIR_NAME), { recursive: true });
		await writeFile(
			join(cwd, CONFIG_DIR_NAME, "repo-search-subagent.json"),
			JSON.stringify({ model: "legacy/search" }),
		);
		const project = resolveRepoSearchConfig(cwd, true, {
			provider: "openai",
			id: "gpt",
		});
		assert.equal(project.source, "project");
		assert.equal(project.model, "legacy/search");
	});
});

test("resolveRepoSearchConfig rejects invalid JSON and model values", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		const cwd = join(dir, "repo");
		await mkdir(cwd);
		await writeFile(userConfigPath(), "{");
		await assert.rejects(
			async () =>
				resolveRepoSearchConfig(cwd, true, { provider: "openai", id: "gpt" }),
			/无法解析/,
		);
		await writeFile(userConfigPath(), "[]");
		await assert.rejects(
			async () =>
				resolveRepoSearchConfig(cwd, true, { provider: "openai", id: "gpt" }),
			/必须是 JSON 对象/,
		);
		await writeFile(
			userConfigPath(),
			JSON.stringify({ repoSearch: { model: "  " } }),
		);
		await assert.rejects(
			async () =>
				resolveRepoSearchConfig(cwd, true, { provider: "openai", id: "gpt" }),
			/非空字符串/,
		);
		await writeFile(
			userConfigPath(),
			JSON.stringify({ repoSearch: { presentation: "nope" } }),
		);
		await assert.rejects(
			async () =>
				resolveRepoSearchConfig(cwd, true, { provider: "openai", id: "gpt" }),
			/presentation 无效/,
		);
		await writeFile(
			userConfigPath(),
			JSON.stringify({ repoSearch: [] }),
		);
		await assert.rejects(
			async () =>
				resolveRepoSearchConfig(cwd, true, { provider: "openai", id: "gpt" }),
			/必须是 JSON 对象/,
		);
	});
});

test("resolveRepoSearchConfig throws without a model", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		await assert.rejects(
			async () => resolveRepoSearchConfig(dir, true, undefined),
			/未配置 Repo Search/,
		);
	});
});

test("resolveRepoSearchConfig imports user-level repo-search-subagent.json", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		const cwd = join(dir, "repo");
		await mkdir(cwd);
		await writeFile(
			join(dir, "repo-search-subagent.json"),
			JSON.stringify({ model: "imported/search", presentation: "split" }),
		);
		const config = resolveRepoSearchConfig(cwd, true, {
			provider: "openai",
			id: "gpt",
		});
		assert.equal(config.source, "user");
		assert.equal(config.model, "imported/search");
		assert.equal(config.presentation, "split");
	});
});
