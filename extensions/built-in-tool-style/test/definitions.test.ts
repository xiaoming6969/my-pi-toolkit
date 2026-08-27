import assert from "node:assert/strict";
import test from "node:test";
import { createStyledDefinitions } from "../definitions.ts";
import { createConfiguredBuiltinRenderers } from "../renderers.ts";
import { writeBuiltinToolStyle } from "../config.ts";
import { withTempAgentDir } from "../../shared/test/fake-extension.ts";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

test("createStyledDefinitions forwards optional read and bash options", () => {
	const defaults = createStyledDefinitions("/tmp");
	assert.equal(defaults.read.name, "read");
	assert.equal(defaults.bash.name, "bash");
	const custom = createStyledDefinitions("/tmp", {
		read: { maxBytes: 10 },
		bash: { timeout: 1 },
	} as never);
	assert.equal(custom.read.name, "read");
	assert.equal(custom.bash.name, "bash");
});

test("createConfiguredBuiltinRenderers respects native, grok, and invalid config", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		writeBuiltinToolStyle("native");
		assert.deepEqual(createConfiguredBuiltinRenderers("/tmp"), {});
		writeBuiltinToolStyle("grok");
		assert.equal(createConfiguredBuiltinRenderers("/tmp").read?.name, "read");
		await writeFile(join(dir, "ming-core.json"), "{");
		assert.deepEqual(createConfiguredBuiltinRenderers("/tmp"), {});
	});
});
