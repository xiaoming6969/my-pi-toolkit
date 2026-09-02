import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { projectConfigPath } from "../config.ts";
import {
	NEW_CONVERSATION_DEFAULTS_ENTRY,
	wantsNewConversationDefaults,
} from "../pending-new-conversation.ts";

test("wantsNewConversationDefaults stays true until an assistant reply", () => {
	assert.equal(wantsNewConversationDefaults([]), false);
	assert.equal(
		wantsNewConversationDefaults([
			{
				type: "custom",
				customType: NEW_CONVERSATION_DEFAULTS_ENTRY,
			} as never,
		]),
		true,
	);
	assert.equal(
		wantsNewConversationDefaults([
			{
				type: "custom",
				customType: NEW_CONVERSATION_DEFAULTS_ENTRY,
			} as never,
			{
				type: "message",
				message: { role: "user" },
			} as never,
		]),
		true,
	);
	assert.equal(
		wantsNewConversationDefaults([
			{
				type: "custom",
				customType: NEW_CONVERSATION_DEFAULTS_ENTRY,
			} as never,
			{
				type: "message",
				message: { role: "assistant" },
			} as never,
		]),
		false,
	);
});

test("projectConfigPath walks up to ming-core.json or legacy model-manager.json", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "model-manager-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const nested = join(root, "apps", "web");
	await mkdir(nested, { recursive: true });
	assert.equal(
		projectConfigPath(nested),
		join(nested, CONFIG_DIR_NAME, "ming-core.json"),
	);

	const legacyPath = join(root, CONFIG_DIR_NAME, "model-manager.json");
	await mkdir(join(root, CONFIG_DIR_NAME), { recursive: true });
	await writeFile(legacyPath, "{}\n");
	assert.equal(projectConfigPath(nested), legacyPath);
	assert.equal(projectConfigPath(root), legacyPath);

	const toolkitPath = join(root, CONFIG_DIR_NAME, "ming-core.json");
	await writeFile(toolkitPath, "{}\n");
	assert.equal(projectConfigPath(nested), toolkitPath);
	assert.equal(projectConfigPath(root), toolkitPath);
});
