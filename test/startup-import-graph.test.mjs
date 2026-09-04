import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const FORBIDDEN = [
	"highlight.js",
	"grok-mermaid",
	"beautiful-mermaid",
	join(root, "extensions/browser-review/markdown-preview.ts"),
	join(root, "extensions/browser-review/syntax-highlight.js"),
];

function stripComments(source) {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function staticSpecifiers(source) {
	const body = stripComments(source);
	const specs = [];
	const fromRe =
		/^(?:import|export)\s+(?!type\b)(?:[\s\S]*?\sfrom\s+|[\s*]+)?["']([^"']+)["']/gm;
	let match = fromRe.exec(body);
	while (match) {
		const lineStart = body.lastIndexOf("\n", match.index) + 1;
		const line = body.slice(lineStart, match.index);
		if (!/\bimport\s+type\b|\bexport\s+type\b/.test(line + match[0])) {
			specs.push(match[1]);
		}
		match = fromRe.exec(body);
	}
	const sideEffectRe = /^import\s+["']([^"']+)["']/gm;
	match = sideEffectRe.exec(body);
	while (match) {
		specs.push(match[1]);
		match = sideEffectRe.exec(body);
	}
	return specs;
}

function resolveSpecifier(fromFile, spec) {
	if (spec.startsWith("node:") || isAbsolute(spec)) return spec;
	if (!spec.startsWith(".")) return spec;
	const base = join(dirname(fromFile), spec);
	const candidates = [
		base,
		base.replace(/\.js$/i, ".ts"),
		`${base}.ts`,
		`${base}.js`,
		join(base, "index.ts"),
		join(base, "index.js"),
	];
	return candidates.find((path) => existsSync(path)) ?? base;
}

function collectGraph(entry) {
	const files = new Set();
	const packages = new Set();
	const queue = [entry];
	while (queue.length > 0) {
		const file = queue.pop();
		if (files.has(file) || !existsSync(file)) continue;
		files.add(file);
		const specs = staticSpecifiers(readFileSync(file, "utf8"));
		for (const spec of specs) {
			if (!spec.startsWith(".")) {
				packages.add(spec);
				continue;
			}
			const resolved = resolveSpecifier(file, spec);
			if (!files.has(resolved)) queue.push(resolved);
		}
	}
	return { files, packages };
}

function isForbidden(file, packages) {
	for (const name of FORBIDDEN) {
		if (!name.includes("\\") && !name.includes("/") && packages.has(name)) {
			return name;
		}
		if (file === name || file.replace(/\\/g, "/") === name.replace(/\\/g, "/")) {
			return relative(root, file).replaceAll("\\", "/");
		}
	}
	return undefined;
}

test("public extension startup graphs omit heavy markdown modules", () => {
	assert.ok(Array.isArray(pkg.pi.extensions));
	const hits = [];
	for (const rel of pkg.pi.extensions) {
		const entry = join(root, rel);
		const graph = collectGraph(entry);
		for (const file of graph.files) {
			const hit = isForbidden(file, graph.packages);
			if (hit) hits.push(`${rel} -> ${hit}`);
		}
		for (const name of graph.packages) {
			if (FORBIDDEN.includes(name)) hits.push(`${rel} -> ${name}`);
		}
	}
	assert.deepEqual(hits, []);
});
