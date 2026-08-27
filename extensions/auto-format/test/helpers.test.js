import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isEslintFile, isInside, resolvePackageBin, shouldFormat } from "../helpers.js";

test("isInside rejects paths that escape the project root", () => {
	assert.equal(isInside("/repo", "/repo"), true);
	assert.equal(isInside("/repo", "/repo/src/a.ts"), true);
	assert.equal(isInside("/repo", "/repo/../other"), false);
	assert.equal(isInside("/repo", "/tmp/a.ts"), false);
});

test("shouldFormat skips node_modules, lockfiles, and minified assets", () => {
	assert.equal(shouldFormat("src/index.ts"), true);
	assert.equal(shouldFormat("node_modules/pkg/index.js"), false);
	assert.equal(shouldFormat("src/node_modules/pkg/index.js"), false);
	assert.equal(shouldFormat("package-lock.json"), false);
	assert.equal(shouldFormat("app.min.js"), false);
	assert.equal(shouldFormat("theme.min.css"), false);
});

test("isEslintFile matches JS and TS extensions only", () => {
	assert.equal(isEslintFile("a.ts"), true);
	assert.equal(isEslintFile("a.mjs"), true);
	assert.equal(isEslintFile(join("src", "a.tsx")), true);
	assert.equal(isEslintFile("readme.md"), false);
	assert.equal(isEslintFile("a.css"), false);
});

test("resolvePackageBin finds local bins and ignores missing packages", () => {
	assert.equal(resolvePackageBin("/does-not-exist", "no-such-package"), undefined);
	assert.match(resolvePackageBin(process.cwd(), "tsx") ?? "", /tsx/);

	const root = mkdtempSync(join(tmpdir(), "auto-format-bin-"));
	try {
		mkdirSync(join(root, "node_modules", "string-bin"), { recursive: true });
		writeFileSync(
			join(root, "node_modules", "string-bin", "package.json"),
			JSON.stringify({ name: "string-bin", bin: "./cli.js" }),
		);
		writeFileSync(join(root, "node_modules", "string-bin", "cli.js"), "#!/usr/bin/env node\n");
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "app" }));
		assert.match(resolvePackageBin(root, "string-bin") ?? "", /cli\.js$/);
		writeFileSync(
			join(root, "node_modules", "string-bin", "package.json"),
			JSON.stringify({ name: "string-bin", bin: { other: "./cli.js" } }),
		);
		assert.equal(resolvePackageBin(root, "string-bin"), undefined);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
