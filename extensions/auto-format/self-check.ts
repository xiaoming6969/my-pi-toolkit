import { resolve } from "node:path";
import {
	isEslintFile,
	isInside,
	resolvePackageBin,
	shouldFormat,
} from "./helpers.js";

function equal(actual: unknown, expected: unknown): void {
	if (actual !== expected) {
		throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
	}
}

const root = process.cwd();
equal(isInside(root, resolve(root, "src/app.ts")), true);
equal(isInside(root, resolve(root, "../outside.ts")), false);
equal(isEslintFile("src/app.mts"), true);
equal(isEslintFile("README.md"), false);
equal(shouldFormat("src/app.min.js"), false);
equal(shouldFormat("node_modules/pkg/index.js"), false);
equal(shouldFormat("src/app.ts"), true);
equal(
	resolvePackageBin(root, "marked", "marked"),
	resolve(root, "node_modules/marked/bin/marked.js"),
);
