import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("pi.extensions entries exist and stay at three public entrypoints", () => {
	assert.deepEqual(pkg.pi.extensions, [
		"./extensions/ming-core/index.ts",
		"./extensions/tapd/index.ts",
		"./extensions/context7/index.ts",
	]);
	for (const rel of pkg.pi.extensions) {
		assert.equal(existsSync(join(root, rel)), true, rel);
	}
});

test("skills and themes listed in package.json exist", () => {
	for (const rel of pkg.pi.skills) {
		assert.equal(existsSync(join(root, rel, "SKILL.md")), true, rel);
	}
	for (const rel of pkg.pi.themes) {
		assert.equal(existsSync(join(root, rel)), true, rel);
	}
});

test("published files include extensions and exclude per-module test folders", () => {
	assert.ok(pkg.files.includes("extensions/"));
	assert.ok(pkg.files.includes("!extensions/**/test/**"));
	assert.equal(pkg.scripts.test, "node scripts/run-tests.mjs");
	assert.match(pkg.engines.node, /22\.19/);
});
