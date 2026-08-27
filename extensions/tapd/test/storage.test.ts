import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
	loadPathHistory,
	rememberProjectPaths,
	removeProjectPathFromHistory,
} from "../sessions/storage.ts";
import { withTempAgentDir } from "../../shared/test/fake-extension.ts";

test("path history remembers, dedupes, and removes project paths", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		assert.deepEqual(loadPathHistory(), []);
		rememberProjectPaths([" /a ", "/b", ""]);
		assert.deepEqual(loadPathHistory(), ["/a", "/b"]);
		rememberProjectPaths(["/b", "/c"]);
		assert.deepEqual(loadPathHistory(), ["/b", "/c", "/a"]);
		removeProjectPathFromHistory("/b");
		assert.deepEqual(loadPathHistory(), ["/c", "/a"]);
		rememberProjectPaths([]);
		assert.deepEqual(loadPathHistory(), ["/c", "/a"]);

		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "tapd-project-paths.json"), "{not-json");
		assert.deepEqual(loadPathHistory(), []);
		await writeFile(join(dir, "tapd-project-paths.json"), "[1, \"ok\"]\n");
		assert.deepEqual(loadPathHistory(), ["ok"]);
	});
});
