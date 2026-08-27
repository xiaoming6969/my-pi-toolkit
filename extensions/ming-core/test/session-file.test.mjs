import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { rewriteSessionCwd } from "../worktree/session-file.ts";

test("rewriteSessionCwd preserves session id and entries", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-session-cwd-"));
	const file = join(dir, "session.jsonl");
	const header = {
		type: "session",
		version: 3,
		id: "same-session",
		timestamp: new Date().toISOString(),
		cwd: dir,
	};
	const entry = {
		type: "custom",
		id: "entry-1",
		parentId: null,
		timestamp: new Date().toISOString(),
		customType: "test",
		data: { ok: true },
	};
	writeFileSync(file, `${JSON.stringify(header)}\n${JSON.stringify(entry)}\n`);
	const target = join(dir, "worktree");

	assert.equal(rewriteSessionCwd(file, target), dir);
	const lines = readFileSync(file, "utf8").trim().split("\n").map(JSON.parse);
	assert.equal(lines[0].id, "same-session");
	assert.equal(lines[0].cwd, resolve(target));
	assert.deepEqual(lines[1], entry);
});

test("rewriteSessionCwd rejects invalid headers without modifying the file", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-session-cwd-invalid-"));
	const file = join(dir, "session.jsonl");
	writeFileSync(file, "not-json\n");

	assert.throws(() => rewriteSessionCwd(file, dir), /会话文件头无效/);
	assert.equal(readFileSync(file, "utf8"), "not-json\n");
});
