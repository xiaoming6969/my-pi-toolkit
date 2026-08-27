import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
	resolveBuiltinToolStyle,
	writeBuiltinToolStyle,
} from "../config.ts";
import { withTempAgentDir } from "../../shared/test/fake-extension.ts";

test("resolveBuiltinToolStyle defaults to grok and writes native/readonly", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		const defaulted = resolveBuiltinToolStyle();
		assert.equal(defaulted.style, "grok");
		assert.equal(defaulted.enabledTools.length, 7);
		writeBuiltinToolStyle("native");
		assert.deepEqual(resolveBuiltinToolStyle().enabledTools, []);
		writeBuiltinToolStyle(["read", "grep"]);
		assert.deepEqual(resolveBuiltinToolStyle().style, ["read", "grep"]);
		await writeFile(join(dir, "ming-core.json"), "{");
		assert.throws(() => resolveBuiltinToolStyle(), /无法解析/);
		await writeFile(join(dir, "ming-core.json"), "[]");
		assert.throws(() => resolveBuiltinToolStyle(), /JSON 对象/);
		await writeFile(
			join(dir, "ming-core.json"),
			JSON.stringify({ builtinToolStyle: ["read", "nope"] }),
		);
		assert.throws(() => resolveBuiltinToolStyle(), /工具名称数组/);
	});
});
