import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import helpsExtension, { TOOLKIT_REPO_URL } from "../index.ts";

test("registers /helps against the public toolkit repository", () => {
	const commands = new Map<string, { description: string }>();
	helpsExtension({
		registerCommand(name, definition) {
			commands.set(name, definition);
		},
	} as ExtensionAPI);
	assert.equal(
		TOOLKIT_REPO_URL,
		"https://github.com/xiaoming6969/my-pi-toolkit",
	);
	assert.equal(commands.get("helps")?.description, "Open my-pi-toolkit documentation on GitHub");
});
