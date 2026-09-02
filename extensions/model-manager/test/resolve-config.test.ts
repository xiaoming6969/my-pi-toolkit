import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
	resolveNewConversationConfig,
	userConfigPath,
} from "../config.ts";
import { withTempAgentDir } from "../../shared/test/fake-extension.ts";

test("resolveNewConversationConfig merges user and project files", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		const cwd = await mkdir(join(dir, "proj"), { recursive: true }).then(() =>
			join(dir, "proj"),
		);
		assert.deepEqual(resolveNewConversationConfig(cwd, true).source, "none");
		await writeFile(
			userConfigPath(),
			JSON.stringify({
				newConversation: {
					enabled: true,
					model: "openai/gpt",
					thinkingLevel: "low",
				},
			}),
		);
		const user = resolveNewConversationConfig(cwd, false);
		assert.equal(user.source, "user");
		assert.equal(user.provider, "openai");
		assert.equal(user.modelId, "gpt");
		assert.equal(user.enabled, true);

		await mkdir(join(cwd, ".pi"), { recursive: true });
		await writeFile(
			join(cwd, ".pi", "ming-core.json"),
			JSON.stringify({
				newConversation: { model: "anthropic/claude", thinkingLevel: "high" },
			}),
		);
		const project = resolveNewConversationConfig(cwd, true);
		assert.equal(project.source, "project");
		assert.equal(project.provider, "anthropic");
		assert.equal(project.thinkingLevel, "high");
	});
});

test("resolveNewConversationConfig still reads legacy project model-manager.json", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		const cwd = join(dir, "proj");
		await mkdir(join(cwd, ".pi"), { recursive: true });
		await writeFile(
			join(cwd, ".pi", "model-manager.json"),
			JSON.stringify({
				newConversation: { model: "legacy/model", thinkingLevel: "max" },
			}),
		);
		const project = resolveNewConversationConfig(cwd, true);
		assert.equal(project.source, "project");
		assert.equal(project.provider, "legacy");
		assert.equal(project.modelId, "model");
		assert.equal(project.thinkingLevel, "max");
	});
});

test("resolveNewConversationConfig validates JSON and model format", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		await writeFile(userConfigPath(), "not-json");
		assert.throws(() => resolveNewConversationConfig(dir, false), /无法解析/);
		await writeFile(userConfigPath(), "[]");
		assert.throws(
			() => resolveNewConversationConfig(dir, false),
			/必须是 JSON 对象/,
		);
		await writeFile(
			userConfigPath(),
			JSON.stringify({ newConversation: { enabled: true, model: "noshard" } }),
		);
		assert.throws(
			() => resolveNewConversationConfig(dir, false),
			/provider\/model-id/,
		);
		await writeFile(
			userConfigPath(),
			JSON.stringify({ newConversation: { enabled: false } }),
		);
		assert.equal(resolveNewConversationConfig(dir, false).enabled, false);
		await writeFile(
			userConfigPath(),
			JSON.stringify({ newConversation: { enabled: "yes" } }),
		);
		assert.throws(
			() => resolveNewConversationConfig(dir, false),
			/enabled 必须是布尔值/,
		);
		await writeFile(
			userConfigPath(),
			JSON.stringify({ newConversation: { model: "x", thinkingLevel: "nope" } }),
		);
		assert.throws(
			() => resolveNewConversationConfig(dir, false),
			/thinkingLevel 必须是/,
		);
		await writeFile(
			userConfigPath(),
			JSON.stringify({ newConversation: [] }),
		);
		assert.throws(
			() => resolveNewConversationConfig(dir, false),
			/newConversation 必须是 JSON 对象/,
		);
		await writeFile(
			userConfigPath(),
			JSON.stringify({ newConversation: { enabled: true } }),
		);
		assert.throws(
			() => resolveNewConversationConfig(dir, false),
			/model 未配置/,
		);
	});
});

test("resolveNewConversationConfig imports user-level model-manager.json", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		await writeFile(
			join(dir, "model-manager.json"),
			JSON.stringify({
				newConversation: { model: "imported/model", thinkingLevel: "low" },
			}),
		);
		const config = resolveNewConversationConfig(dir, false);
		assert.equal(config.source, "user");
		assert.equal(config.provider, "imported");
		assert.equal(config.modelId, "model");
	});
});
