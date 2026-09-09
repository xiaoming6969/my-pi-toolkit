import { isAbsolute, relative, resolve, sep } from "node:path";
import { readFile, stat } from "node:fs/promises";
import {
	countPatchStats,
	gitUnifiedPatch,
	MAX_DIFF_BYTES,
	MAX_FILE_BYTES,
	omittedPatch,
} from "./patch.js";
import type { TurnDiffEntry, TurnDiffFile } from "./entry.js";

interface FileSnapshot {
	relativePath: string;
	original: string | undefined;
	omitted?: "size" | "binary";
}

interface CurrentFile {
	content?: string;
	omitted?: "size" | "binary";
	missing: boolean;
}

export class TurnDiffCollector {
	private readonly snapshots = new Map<string, FileSnapshot>();

	clear(): void {
		this.snapshots.clear();
	}

	async snapshotPath(cwd: string, inputPath: unknown): Promise<void> {
		if (typeof inputPath !== "string" || !inputPath.trim()) return;
		const absolute = resolve(cwd, inputPath);
		if (!isInside(cwd, absolute) || hasNodeModules(absolute)) return;
		if (this.snapshots.has(absolute)) return;
		const relativePath = toPosix(relative(cwd, absolute)) || toPosix(inputPath);
		const current = await inspectFile(absolute);
		if (current.missing) {
			this.snapshots.set(absolute, { relativePath, original: undefined });
			return;
		}
		if (current.omitted) {
			this.snapshots.set(absolute, {
				relativePath,
				original: undefined,
				omitted: current.omitted,
			});
			return;
		}
		this.snapshots.set(absolute, { relativePath, original: current.content });
	}

	async build(maxDiffBytes = MAX_DIFF_BYTES): Promise<TurnDiffEntry | undefined> {
		const files: TurnDiffFile[] = [];
		const patches: string[] = [];
		let added = 0;
		let removed = 0;
		const entries = [...this.snapshots.entries()].sort((left, right) =>
			left[1].relativePath.localeCompare(right[1].relativePath),
		);
		for (const [absolute, snapshot] of entries) {
			const built = await buildFilePatch(absolute, snapshot);
			if (!built) continue;
			files.push(built.file);
			patches.push(built.patch);
			added += built.file.added;
			removed += built.file.removed;
		}
		if (files.length === 0) return undefined;
		const patch = patches.join("\n");
		if (Buffer.byteLength(patch) > maxDiffBytes) {
			return { files, added, removed, patch: "", tooLarge: true };
		}
		return { files, added, removed, patch };
	}
}

async function buildFilePatch(
	absolute: string,
	snapshot: FileSnapshot,
): Promise<{ file: TurnDiffFile; patch: string } | undefined> {
	const path = snapshot.relativePath;
	const current = await inspectFile(absolute);
	if (snapshot.omitted) {
		return omittedResult(path, snapshot.omitted);
	}
	if (current.omitted) {
		return omittedResult(path, current.omitted);
	}
	if (snapshot.original === undefined && current.missing) return undefined;
	if (!current.missing && snapshot.original === current.content) return undefined;

	const patch = gitUnifiedPatch(
		path,
		snapshot.original ?? "",
		current.content ?? "",
	);
	if (!patch) return undefined;
	const stats = countPatchStats(patch);
	return {
		file: { path, added: stats.added, removed: stats.removed },
		patch,
	};
}

function omittedResult(
	path: string,
	kind: "size" | "binary",
): { file: TurnDiffFile; patch: string } {
	const reason =
		kind === "binary"
			? "binary file omitted"
			: `file omitted: ${MAX_FILE_BYTES} bytes`;
	return {
		file: { path, added: 0, removed: 0, omitted: true },
		patch: omittedPatch(path, reason),
	};
}

async function inspectFile(absolute: string): Promise<CurrentFile> {
	try {
		const info = await stat(absolute);
		if (!info.isFile()) return { missing: true };
		if (info.size > MAX_FILE_BYTES) return { missing: false, omitted: "size" };
		const buffer = await readFile(absolute);
		if (buffer.includes(0)) return { missing: false, omitted: "binary" };
		return { missing: false, content: buffer.toString("utf8") };
	} catch {
		return { missing: true };
	}
}

function isInside(root: string, path: string): boolean {
	const rel = relative(root, path);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function hasNodeModules(path: string): boolean {
	return toPosix(path).split("/").includes("node_modules");
}

function toPosix(path: string): string {
	return path.split(sep).join("/");
}
