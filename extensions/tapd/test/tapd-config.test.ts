import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../core/config.ts";
import { withTempAgentDir } from "../../shared/test/fake-extension.ts";

test("loadConfig reads tapd.json and ignores invalid JSON", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		assert.equal(loadConfig(), null);
		await writeFile(
			join(dir, "tapd.json"),
			JSON.stringify({ token: "abc", baseUrl: "https://tapd.example" }),
		);
		assert.deepEqual(loadConfig(), {
			token: "abc",
			baseUrl: "https://tapd.example",
		});
		await writeFile(join(dir, "tapd.json"), "{");
		assert.equal(loadConfig(), null);
	});
});
