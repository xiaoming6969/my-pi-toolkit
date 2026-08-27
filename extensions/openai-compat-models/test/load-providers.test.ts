import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { loadDiscoverableProviders } from "../config.ts";
import { withTempAgentDir } from "../../shared/test/fake-extension.ts";

test("loadDiscoverableProviders skips handwritten models and incomplete entries", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		assert.deepEqual(loadDiscoverableProviders(), []);
		await writeFile(join(dir, "models.json"), "{");
		assert.deepEqual(loadDiscoverableProviders(), []);
		await writeFile(
			join(dir, "models.json"),
			JSON.stringify({
				providers: {
					ok: {
						name: "OK",
						baseUrl: "https://api.example/v1",
						apiKey: "k",
						api: "openai-completions",
					},
					listed: {
						baseUrl: "https://api.example/v1",
						apiKey: "k",
						models: [{ id: "x" }],
					},
					missing: { baseUrl: "https://api.example/v1" },
					badApi: {
						baseUrl: "https://api.example/v1",
						apiKey: "k",
						api: "anthropic",
					},
				},
			}),
		);
		const providers = loadDiscoverableProviders();
		assert.equal(providers.length, 1);
		assert.equal(providers[0]?.id, "ok");
		assert.equal(providers[0]?.api, "openai-completions");
		await writeFile(join(dir, "models.json"), JSON.stringify({}));
		assert.deepEqual(loadDiscoverableProviders(), []);
		await writeFile(
			join(dir, "models.json"),
			JSON.stringify({
				providers: {
					blank: null,
					defaults: {
						baseUrl: " https://api.example/v1 ",
						apiKey: " k ",
						name: "  ",
					},
				},
			}),
		);
		const defaults = loadDiscoverableProviders();
		assert.equal(defaults[0]?.api, "openai-completions");
		assert.equal(defaults[0]?.name, undefined);
	});
});
