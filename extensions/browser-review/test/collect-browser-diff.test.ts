import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { collectBrowserDiff } from "../git-diff.ts";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]) {
	await execFileAsync("git", args, { cwd });
}

async function repo(): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "browser-diff-"));
	await git(root, ["init", "-b", "main"]);
	await git(root, ["config", "user.email", "test@example.com"]);
	await git(root, ["config", "user.name", "Test"]);
	await writeFile(path.join(root, "app.ts"), "export const a = 1;\n");
	await git(root, ["add", "."]);
	await git(root, ["commit", "-m", "init"]);
	return root;
}

test("collectBrowserDiff includes committed and untracked edits", async (t) => {
	const root = await repo();
	t.after(() => rm(root, { recursive: true, force: true }));
	await git(root, ["checkout", "-b", "feature"]);
	await writeFile(path.join(root, "app.ts"), "export const a = 2;\n");
	await git(root, ["add", "."]);
	await git(root, ["commit", "-m", "feature"]);
	await writeFile(path.join(root, "widget.ts"), "export const w = 1;\n");

	const branch = await collectBrowserDiff(root, "branch", "main");
	assert.equal(branch.kind, "code");
	assert.match(branch.subtitle ?? "", /branch · base main/);
	assert.ok(branch.lines.some((line) => line.file === "app.ts"));
	assert.ok(branch.lines.some((line) => line.file === "widget.ts"));

	const uncommitted = await collectBrowserDiff(root, "uncommitted");
	assert.match(uncommitted.subtitle ?? "", /uncommitted/);
	assert.ok(uncommitted.lines.some((line) => line.file === "widget.ts"));

	await writeFile(path.join(root, "binary.bin"), Buffer.from([0, 1, 2, 3]));
	await writeFile(path.join(root, "huge.txt"), "x".repeat(256 * 1024 + 1));
	const withExtras = await collectBrowserDiff(root, "uncommitted");
	assert.ok(withExtras.lines.some((line) => line.file === "binary.bin"));
	assert.ok(withExtras.lines.some((line) => line.text.includes("omitted")));
});

test("collectBrowserDiff rejects repos without HEAD or without a diff", async (t) => {
	const empty = await mkdtemp(path.join(tmpdir(), "browser-diff-empty-"));
	t.after(() => rm(empty, { recursive: true, force: true }));
	await git(empty, ["init", "-b", "main"]);
	await assert.rejects(() => collectBrowserDiff(empty, "uncommitted"), /还没有 HEAD/);

	const clean = await repo();
	t.after(() => rm(clean, { recursive: true, force: true }));
	await assert.rejects(
		() => collectBrowserDiff(clean, "uncommitted"),
		/没有可审核的代码修改/,
	);
	await assert.rejects(
		() => collectBrowserDiff(clean, "branch", "missing"),
		/审核基础分支不存在/,
	);
});
