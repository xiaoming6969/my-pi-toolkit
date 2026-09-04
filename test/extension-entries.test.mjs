import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
	DIST_EXTENSIONS,
	setPiExtensions,
	SOURCE_EXTENSIONS,
} from "../scripts/extension-entries.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgSource = readFileSync(join(root, "package.json"), "utf8");
const pkg = JSON.parse(pkgSource);

test("SOURCE_EXTENSIONS match the committed package.json", () => {
	assert.deepEqual(pkg.pi.extensions, SOURCE_EXTENSIONS);
	assert.deepEqual(DIST_EXTENSIONS, [
		"./dist/ming-core.js",
		"./dist/tapd.js",
		"./dist/context7.js",
	]);
});

test("setPiExtensions rewrites only the extensions array", () => {
	const dist = setPiExtensions(pkgSource, DIST_EXTENSIONS);
	const parsed = JSON.parse(dist);
	assert.deepEqual(parsed.pi.extensions, DIST_EXTENSIONS);
	assert.deepEqual(parsed.pi.skills, pkg.pi.skills);
	assert.equal(parsed.scripts.prepack, "node scripts/prepack.mjs");
	assert.match(dist, /\n    "skills": \[/);
	const restored = setPiExtensions(dist, SOURCE_EXTENSIONS);
	assert.deepEqual(JSON.parse(restored).pi.extensions, SOURCE_EXTENSIONS);
	assert.equal(setPiExtensions(pkgSource, SOURCE_EXTENSIONS), pkgSource);
});

test("setPiExtensions rejects package.json without extensions", () => {
	assert.throws(
		() => setPiExtensions("{}\n", SOURCE_EXTENSIONS),
		/missing pi.extensions/,
	);
});
