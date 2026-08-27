import assert from "node:assert/strict";
import test from "node:test";
import {
	extractPiLensExtensionPaths,
	extractRepoSearchExtensionPaths,
	requestedPaths,
	REPO_SEARCH_TOOLS,
} from "../pi-lens.ts";

const EXPECTED_TOOLS = [
	"read",
	"grep",
	"find",
	"ls",
	"lens_diagnostics",
	"lsp_diagnostics",
	"symbol_search",
	"project_report",
	"module_report",
	"read_symbol",
	"read_enclosing",
	"ast_grep_search",
	"ast_grep_outline",
	"ast_grep_dump",
];

const FORBIDDEN_TOOLS = [
	"bash",
	"edit",
	"write",
	"ast_grep_replace",
	"lsp_navigation",
	"lens_diagnostic_mark",
	"pi_lens_activate_tools",
];

test("Repo Search tool allowlist is exact and read-only", () => {
	assert.deepEqual([...REPO_SEARCH_TOOLS], EXPECTED_TOOLS);
	for (const forbidden of FORBIDDEN_TOOLS)
		assert.ok(!REPO_SEARCH_TOOLS.includes(forbidden));
});

test("extracts path and paths arrays for the gitignore guard", () => {
	assert.deepEqual(requestedPaths({ path: "src/a.ts" }), ["src/a.ts"]);
	assert.deepEqual(requestedPaths({ paths: ["src", 42, "tests"] }), [
		"src",
		"tests",
	]);
	assert.deepEqual(requestedPaths({}), ["."]);
});

const resource = (path, source, enabled = true) => ({
	path,
	enabled,
	metadata: { source, scope: "user", origin: "package" },
});

const RESOURCES = [
	resource("/lens/index.ts", "npm:pi-lens"),
	resource("/lens/versioned.ts", "npm:pi-lens@1.2.3"),
	resource("/lens/disabled.ts", "npm:pi-lens", false),
	resource("/cursor/index.js", "npm:@rahularya01/pi-cursor"),
	resource("/other/index.ts", "npm:other"),
];

test("extracts only enabled npm:pi-lens extension paths", () => {
	assert.deepEqual(extractPiLensExtensionPaths(RESOURCES), [
		"/lens/index.ts",
		"/lens/versioned.ts",
	]);
});

test("loads the cursor provider only for cursor models", () => {
	assert.deepEqual(
		extractRepoSearchExtensionPaths(RESOURCES, "cursor/composer-2.5"),
		["/lens/index.ts", "/lens/versioned.ts", "/cursor/index.js"],
	);
	assert.deepEqual(
		extractRepoSearchExtensionPaths(RESOURCES, "openai/gpt-5"),
		["/lens/index.ts", "/lens/versioned.ts"],
	);
});
