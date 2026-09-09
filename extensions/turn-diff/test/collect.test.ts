import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TurnDiffCollector } from "../collect.ts";
import { MAX_FILE_BYTES } from "../patch.ts";

async function tempRoot(t: test.TestContext): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "turn-diff-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	return root;
}

test("build skips unchanged files and paths outside the project", async (t) => {
	const root = await tempRoot(t);
	await writeFile(join(root, "keep.ts"), "same\n");
	const collector = new TurnDiffCollector();
	await collector.snapshotPath(root, "keep.ts");
	await collector.snapshotPath(root, "../escape.ts");
	await collector.snapshotPath(root, "");
	await collector.snapshotPath(root, 1);
	assert.equal(await collector.build(), undefined);
});

test("build merges repeated snapshots of one file and records a new write", async (t) => {
	const root = await tempRoot(t);
	await writeFile(join(root, "app.ts"), "export const a = 1;\n");
	const collector = new TurnDiffCollector();
	await collector.snapshotPath(root, "app.ts");
	await collector.snapshotPath(root, "app.ts");
	await collector.snapshotPath(root, "created.ts");
	await writeFile(join(root, "app.ts"), "export const a = 2;\n");
	await writeFile(join(root, "created.ts"), "export const created = true;\n");

	const entry = await collector.build();
	assert.ok(entry);
	assert.deepEqual(
		entry.files.map((file) => file.path),
		["app.ts", "created.ts"],
	);
	assert.match(entry.patch, /diff --git a\/app\.ts b\/app\.ts/);
	assert.match(entry.patch, /\-export const a = 1;/);
	assert.match(entry.patch, /\+export const a = 2;/);
	assert.match(entry.patch, /new file mode 100644/);
	assert.match(entry.patch, /created\.ts/);
	assert.ok(entry.added >= 2);
	assert.ok(entry.removed >= 1);
	assert.equal(entry.tooLarge, undefined);
});

test("build omits node_modules, binaries, oversized files, and oversize totals", async (t) => {
	const root = await tempRoot(t);
	await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
	await writeFile(join(root, "node_modules", "pkg", "index.js"), "secret\n");
	await writeFile(join(root, "app.ts"), "small\n");
	await writeFile(join(root, "data.bin"), Buffer.from([0, 1, 2, 3]));
	await writeFile(join(root, "huge.txt"), "x".repeat(MAX_FILE_BYTES + 1));

	const collector = new TurnDiffCollector();
	await collector.snapshotPath(root, "node_modules/pkg/index.js");
	await collector.snapshotPath(root, "app.ts");
	await collector.snapshotPath(root, "data.bin");
	await collector.snapshotPath(root, "huge.txt");
	await writeFile(join(root, "app.ts"), "changed\n");

	const entry = await collector.build();
	assert.ok(entry);
	assert.deepEqual(
		entry.files.map((file) => file.path),
		["app.ts", "data.bin", "huge.txt"],
	);
	assert.equal(entry.files[0]?.omitted, undefined);
	assert.equal(entry.files[1]?.omitted, true);
	assert.equal(entry.files[2]?.omitted, true);
	assert.match(entry.patch, /binary file omitted/);
	assert.match(entry.patch, /file omitted:/);

	const tooLarge = await collector.build(10);
	assert.equal(tooLarge?.tooLarge, true);
	assert.equal(tooLarge?.patch, "");
	assert.ok((tooLarge?.files.length ?? 0) >= 1);

	collector.clear();
	assert.equal(await collector.build(), undefined);
});

test("build records a deleted file after a snapshot", async (t) => {
	const root = await tempRoot(t);
	const path = join(root, "gone.ts");
	await writeFile(path, "bye\n");
	const collector = new TurnDiffCollector();
	await collector.snapshotPath(root, "gone.ts");
	await rm(path);
	const entry = await collector.build();
	assert.ok(entry);
	assert.equal(entry.files[0]?.path, "gone.ts");
	assert.match(entry.patch, /deleted file mode/);
	assert.match(entry.patch, /\-bye/);
});

test("build omits a file that grows or becomes binary after snapshot", async (t) => {
	const root = await tempRoot(t);
	await writeFile(join(root, "grow.ts"), "tiny\n");
	await writeFile(join(root, "flip.ts"), "text\n");
	await mkdir(join(root, "dir"));
	const collector = new TurnDiffCollector();
	await collector.snapshotPath(root, "grow.ts");
	await collector.snapshotPath(root, "flip.ts");
	await collector.snapshotPath(root, "dir");
	await collector.snapshotPath(root, ".");
	await writeFile(join(root, "grow.ts"), "x".repeat(MAX_FILE_BYTES + 1));
	await writeFile(join(root, "flip.ts"), Buffer.from([0, 1, 2]));
	const entry = await collector.build();
	assert.ok(entry);
	assert.deepEqual(
		entry.files.map((file) => file.path).sort(),
		["flip.ts", "grow.ts"],
	);
	assert.ok(entry.files.every((file) => file.omitted));
	assert.match(entry.patch, /file omitted:/);
	assert.match(entry.patch, /binary file omitted/);
});

test("build skips a newly created empty file", async (t) => {
	const root = await tempRoot(t);
	const collector = new TurnDiffCollector();
	await collector.snapshotPath(root, "empty.ts");
	await writeFile(join(root, "empty.ts"), "");
	assert.equal(await collector.build(), undefined);
});
