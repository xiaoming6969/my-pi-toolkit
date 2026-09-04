import assert from "node:assert/strict";
import test from "node:test";
import { resolveTapdLeanExtensionPaths } from "../lean-extensions.ts";

test("TAPD lean children always load openai-compat-models", async () => {
	const paths = await resolveTapdLeanExtensionPaths(
		"/no-such-project",
		false,
		"openai/gpt",
	);
	assert.ok(
		paths.some((path) =>
			path.replaceAll("\\", "/").endsWith("openai-compat-models/index.ts"),
		),
	);
});
