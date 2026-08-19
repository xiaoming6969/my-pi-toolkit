import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

const ESLINT_EXTENSIONS = new Set([
	".cjs",
	".cts",
	".js",
	".jsx",
	".mjs",
	".mts",
	".ts",
	".tsx",
]);
const LOCKFILES = new Set([
	"bun.lock",
	"bun.lockb",
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
]);

/** @param {string} root @param {string} path */
export function isInside(root, path) {
	const rel = relative(root, path);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** @param {string} path */
export function shouldFormat(path) {
	const normalized = path.replaceAll("\\", "/");
	return (
		!normalized.split("/").includes("node_modules") &&
		!LOCKFILES.has(basename(path).toLowerCase()) &&
		!(/\.min\.(?:css|js)$/i.test(path))
	);
}

/** @param {string} path */
export function isEslintFile(path) {
	return ESLINT_EXTENSIONS.has(extname(path).toLowerCase());
}

/**
 * @param {string} cwd
 * @param {string} packageName
 * @param {string} [binName]
 * @returns {string | undefined}
 */
export function resolvePackageBin(cwd, packageName, binName = packageName) {
	try {
		const requireFromProject = createRequire(join(cwd, "package.json"));
		const packagePath = requireFromProject.resolve(`${packageName}/package.json`);
		const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
		const relativeBin =
			typeof packageJson.bin === "string"
				? packageJson.bin
				: packageJson.bin?.[binName];
		return relativeBin ? resolve(dirname(packagePath), relativeBin) : undefined;
	} catch {
		return undefined;
	}
}
