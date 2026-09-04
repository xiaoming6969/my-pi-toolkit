import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import {
	DIST_EXTENSIONS,
	setPiExtensions,
	SOURCE_EXTENSIONS,
} from "./extension-entries.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "package.json");
const forbidden = ["highlight.js", "grok-mermaid", "beautiful-mermaid"];

function npmSpawn() {
	const execpath = process.env.npm_execpath;
	if (execpath) return { command: process.execPath, prefix: [execpath] };
	return {
		command: process.platform === "win32" ? "npm.cmd" : "npm",
		prefix: [],
	};
}

function run(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: root,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(
					new Error(
						`${command} ${args.join(" ")} failed (${code})\n${stderr || stdout}`,
					),
				);
				return;
			}
			resolve({ stdout, stderr });
		});
	});
}

function tarFiles(tgz) {
	const buf = gunzipSync(tgz);
	const files = new Map();
	let offset = 0;
	let pendingName;
	while (offset + 512 <= buf.length) {
		const header = buf.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		const rawName = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
		const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
		const type = String.fromCharCode(header[156] || 0);
		const sizeText = header
			.subarray(124, 136)
			.toString("utf8")
			.replace(/\0.*$/, "")
			.trim();
		const size = sizeText ? parseInt(sizeText, 8) : 0;
		offset += 512;
		const payload = buf.subarray(offset, offset + size);
		offset += Math.ceil(size / 512) * 512;
		if (type === "L" || rawName === "././@LongLink") {
			pendingName = payload.toString("utf8").replace(/\0.*$/, "");
			continue;
		}
		if (type === "x" || type === "g") {
			pendingName = payload.toString("utf8").match(/(?:^|\n)\d+ path=([^\n]+)/)?.[1];
			continue;
		}
		if (type !== "0" && type !== "\0" && type !== "" && type !== " ") continue;
		const name = pendingName || [prefix, rawName].filter(Boolean).join("/");
		pendingName = undefined;
		if (name) files.set(name, payload);
	}
	return files;
}

function parseNpmJson(stdout) {
	const trimmed = stdout.trim();
	const start = trimmed.indexOf("[");
	if (start < 0) throw new Error(`npm pack produced no JSON:\n${stdout.slice(0, 500)}`);
	return JSON.parse(trimmed.slice(start));
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function staticImportOf(source, pkg) {
	const body = source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/.*$/gm, "$1");
	const re = new RegExp(
		`(?:^|\\n)(?:import|export)\\s+(?!type\\b)(?:[\\s\\S]*?\\sfrom\\s+|[\\s*]+)?["']${pkg}["']`,
	);
	return re.test(body);
}

const original = await readFile(pkgPath, "utf8");
const packDir = await mkdtemp(join(tmpdir(), "my-pi-toolkit-pack-"));
try {
	const { command, prefix } = npmSpawn();
	const { stdout } = await run(command, [
		...prefix,
		"pack",
		"--json",
		`--pack-destination=${packDir}`,
	]);
	const packed = parseNpmJson(stdout);
	const filename = Array.isArray(packed) ? packed[0]?.filename : packed.filename;
	assert(typeof filename === "string" && filename.endsWith(".tgz"), "pack json missing filename");
	const files = tarFiles(await readFile(join(packDir, filename)));
	const packedPkg = JSON.parse(
		files.get("package/package.json")?.toString("utf8") ?? "null",
	);
	assert(packedPkg, "tarball missing package/package.json");
	assert(
		JSON.stringify(packedPkg.pi.extensions) === JSON.stringify(DIST_EXTENSIONS),
		`tarball pi.extensions should be dist entries, got ${JSON.stringify(packedPkg.pi.extensions)}`,
	);
	for (const rel of DIST_EXTENSIONS) {
		const inner = `package/${rel.slice(2)}`;
		const buf = files.get(inner);
		assert(buf, `tarball missing ${inner}`);
		const source = buf.toString("utf8");
		for (const pkg of forbidden) {
			assert(
				!staticImportOf(source, pkg),
				`${inner} statically imports ${pkg}`,
			);
		}
	}
	const restored = JSON.parse(await readFile(pkgPath, "utf8"));
	assert(
		JSON.stringify(restored.pi.extensions) === JSON.stringify(SOURCE_EXTENSIONS),
		"postpack should restore TypeScript pi.extensions",
	);
	console.log(`pack ok: ${filename}`);
} finally {
	await writeFile(pkgPath, setPiExtensions(original, SOURCE_EXTENSIONS));
	await rm(packDir, { recursive: true, force: true });
}
