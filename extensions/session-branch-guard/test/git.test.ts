import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	branchExists,
	normalizeRepoPath,
	readDirtySummary,
	readGitContext,
	stashWorkspace,
	summarizeError,
	switchBranch,
} from "../git.ts";

function fakePi(
	responses: Record<string, { code: number; stdout?: string; stderr?: string }>,
): ExtensionAPI {
	return {
		async exec(_command: string, args: string[]) {
			const key = args.join(" ");
			const hit = responses[key];
			if (!hit) return { code: 1, stdout: "", stderr: `unexpected ${key}` };
			return { code: hit.code, stdout: hit.stdout ?? "", stderr: hit.stderr ?? "" };
		},
	} as ExtensionAPI;
}

test("normalizeRepoPath and summarizeError stay display-safe", () => {
	assert.equal(normalizeRepoPath("/repo/./app"), resolve("/repo/app"));
	assert.equal(summarizeError("  a\n  b  "), "a b");
	assert.equal(summarizeError("x".repeat(10), 4), `${"x".repeat(4)}…`);
});

test("readGitContext treats missing repos and detached HEAD", async () => {
	assert.deepEqual(
		await readGitContext(fakePi({ "rev-parse --show-toplevel": { code: 1 } }), "/repo"),
		{ isRepo: false },
	);
	assert.deepEqual(
		await readGitContext(
			fakePi({
				"rev-parse --show-toplevel": { code: 0, stdout: "/repo\n" },
				"branch --show-current": { code: 0, stdout: "" },
				"rev-parse --short HEAD": { code: 0, stdout: "abc123\n" },
			}),
			"/repo",
		),
		{ isRepo: true, repoRoot: "/repo", branch: undefined, head: "abc123" },
	);
	assert.deepEqual(
		await readGitContext(
			fakePi({
				"rev-parse --show-toplevel": { code: 0, stdout: "/repo\n" },
				"branch --show-current": { code: 0, stdout: "main\n" },
				"rev-parse --short HEAD": { code: 0, stdout: "abc123\n" },
			}),
			"/repo",
		),
		{ isRepo: true, repoRoot: "/repo", branch: "main", head: "abc123" },
	);
});

test("dirty summary, switch, stash, and branchExists follow git porcelain", async () => {
	const pi = fakePi({
		"status --porcelain --untracked-files=normal": {
			code: 0,
			stdout: ["M  staged.ts", " M unstaged.ts", "MM both.ts", "?? new.ts", ""].join("\n"),
		},
		"rev-parse --verify --quiet refs/heads/dev": { code: 0 },
		"rev-parse --verify --quiet refs/heads/missing": { code: 1 },
		"switch dev": { code: 0 },
		"switch locked": { code: 1, stderr: "conflict" },
		"stash push --include-untracked -m save": { code: 0 },
		"rev-parse --short stash": { code: 0, stdout: "st123\n" },
	});
	assert.deepEqual(await readDirtySummary(pi, "/repo"), {
		staged: 2,
		unstaged: 2,
		untracked: 1,
		total: 5,
	});
	assert.equal(await branchExists(pi, "/repo", "dev"), true);
	assert.equal(await branchExists(pi, "/repo", "missing"), false);
	assert.deepEqual(await switchBranch(pi, "/repo", "dev"), { ok: true });
	assert.deepEqual(await switchBranch(pi, "/repo", "locked"), {
		ok: false,
		error: "conflict",
	});
	assert.deepEqual(await stashWorkspace(pi, "/repo", "save"), {
		ok: true,
		ref: "st123",
	});
});
