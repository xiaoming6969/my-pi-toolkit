import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { SOURCE_EXTENSIONS } from "./extension-entries.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = join(root, "dist");

function entryName(rel) {
	const match = rel.match(/extensions\/([^/]+)\//);
	if (!match) throw new Error(`Cannot derive dist name from ${rel}`);
	return match[1];
}

const jsToTsPlugin = {
	name: "js-to-ts",
	setup(build) {
		build.onResolve({ filter: /^\./ }, (args) => {
			const requested = resolve(args.resolveDir, args.path);
			const ts = requested.replace(/\.js$/i, ".ts");
			if (existsSync(ts)) return { path: ts };
			if (existsSync(requested)) return { path: requested };
			const withTs = `${requested}.ts`;
			const withJs = `${requested}.js`;
			if (existsSync(withTs)) return { path: withTs };
			if (existsSync(withJs)) return { path: withJs };
			return undefined;
		});
	},
};

export async function buildExtensions() {
	await rm(outdir, { recursive: true, force: true });
	await mkdir(outdir, { recursive: true });
	const entryPoints = Object.fromEntries(
		SOURCE_EXTENSIONS.map((rel) => [entryName(rel), join(root, rel)]),
	);
	await esbuild.build({
		absWorkingDir: root,
		entryPoints,
		outdir,
		entryNames: "[name]",
		chunkNames: "chunks/[name]-[hash]",
		bundle: true,
		splitting: true,
		format: "esm",
		platform: "node",
		target: "node22",
		sourcemap: false,
		legalComments: "none",
		logLevel: "warning",
		external: [
			"@earendil-works/*",
			"@mariozechner/*",
			"typebox",
			"typebox/*",
		],
		plugins: [jsToTsPlugin],
		banner: {
			js: "/* my-pi-toolkit generated extension bundle; do not edit */",
		},
	});
	for (const name of Object.keys(entryPoints)) {
		const file = join(outdir, `${name}.js`);
		if (!existsSync(file)) throw new Error(`missing ${file}`);
		if (extname(file) !== ".js") throw new Error(`unexpected ${file}`);
	}
}

const invoked =
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
	await buildExtensions();
}
