#!/usr/bin/env node
/**
 * Discover per-module tests and run them through Node's test runner
 * with the tsx loader (TypeScript syntax + `.js` → `.ts` resolution).
 *
 * Layout: `extensions/<module>/test/*.test.*` plus repo-level `test/*.test.*`.
 */
import { glob, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const coverage = args.includes("--coverage");
const watch = args.includes("--watch");
const rest = args.filter((arg) => arg !== "--coverage" && arg !== "--watch");
const extraFlags = rest.filter((arg) => arg.startsWith("--"));
const requested = rest.filter((arg) => !arg.startsWith("--"));

const patterns = [
	"extensions/*/test/**/*.test.{js,mjs,cjs,ts}",
	"test/**/*.test.{js,mjs,cjs,ts}",
];

const discovered = [];
for (const pattern of patterns) {
	for await (const file of glob(pattern, { cwd: root })) {
		discovered.push(file);
	}
}
discovered.sort();

const files = requested.length > 0 ? requested : discovered;
if (files.length === 0) {
	console.error("No test files found.");
	process.exit(1);
}

if (coverage) await mkdir(join(root, "coverage"), { recursive: true });

const nodeArgs = ["--import", "tsx"];
if (watch) nodeArgs.push("--watch");
if (coverage) {
	nodeArgs.push(
		"--experimental-test-coverage",
		"--test-coverage-include=extensions/**",
		"--test-coverage-exclude=**/test/**",
	);
}
nodeArgs.push("--test", ...extraFlags);
if (coverage) {
	nodeArgs.push(
		"--test-reporter=spec",
		"--test-reporter-destination=stdout",
		"--test-reporter=lcov",
		"--test-reporter-destination=coverage/lcov.info",
	);
} else {
	nodeArgs.push("--test-reporter=spec");
}
nodeArgs.push(...files);

const child = spawn(process.execPath, nodeArgs, {
	stdio: "inherit",
	cwd: root,
	env: process.env,
});
child.on("exit", (code, signal) => {
	process.exit(signal ? 1 : (code ?? 1));
});
