import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	branchExists,
	normalizeRepoPath,
	readGitContext,
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
			return {
				code: hit.code,
				stdout: hit.stdout ?? "",
				stderr: hit.stderr ?? "",
			};
		},
	} as ExtensionAPI;
}

test("normalizeRepoPath and summarizeError stay display-safe", (t) => {
	assert.equal(normalizeRepoPath("/repo/./app"), resolve("/repo/app"));
	assert.equal(summarizeError("  a\n  b  "), "a b");
	assert.equal(summarizeError("x".repeat(10), 4), `${"x".repeat(4)}…`);
	const original = Object.getOwnPropertyDescriptor(process, "platform");
	Object.defineProperty(process, "platform", { value: "linux" });
	t.after(() => {
		if (original) Object.defineProperty(process, "platform", original);
	});
	assert.equal(normalizeRepoPath("/repo/./app"), resolve("/repo/app"));
});

test("readGitContext treats missing repos and detached HEAD", async () => {
	assert.deepEqual(
		await readGitContext(
			fakePi({ "rev-parse --show-toplevel": { code: 1 } }),
			"/repo",
		),
		{ isRepo: false },
	);
	assert.deepEqual(
		await readGitContext(
			fakePi({ "rev-parse --show-toplevel": { code: 0, stdout: "  \n" } }),
			"/repo",
		),
		{ isRepo: false },
	);
	assert.deepEqual(
		await readGitContext(
			fakePi({
				"rev-parse --show-toplevel": { code: 0, stdout: "/repo\n" },
				"branch --show-current": { code: 0, stdout: "" },
				"rev-parse --short HEAD": { code: 0, stdout: "abc123\n" },
				"rev-parse --git-common-dir": { code: 0, stdout: ".git\n" },
			}),
			"/repo",
		),
		{
			isRepo: true,
			repoRoot: "/repo",
			branch: undefined,
			head: "abc123",
			gitCommonDir: normalizeRepoPath(resolve("/repo", ".git")),
		},
	);
	assert.deepEqual(
		await readGitContext(
			fakePi({
				"rev-parse --show-toplevel": { code: 0, stdout: "/repo\n" },
				"branch --show-current": { code: 0, stdout: "main\n" },
				"rev-parse --short HEAD": { code: 0, stdout: "abc123\n" },
				"rev-parse --git-common-dir": { code: 1 },
			}),
			"/repo",
		),
		{
			isRepo: true,
			repoRoot: "/repo",
			branch: "main",
			head: "abc123",
			gitCommonDir: undefined,
		},
	);
});

test("switch and branchExists follow git results", async () => {
	const pi = fakePi({
		"rev-parse --verify --quiet refs/heads/dev": { code: 0 },
		"rev-parse --verify --quiet refs/heads/missing": { code: 1 },
		"switch dev": { code: 0 },
		"switch locked": { code: 1, stderr: "conflict" },
		"switch empty": { code: 1, stderr: "" },
	});
	assert.equal(await branchExists(pi, "/repo", "dev"), true);
	assert.equal(await branchExists(pi, "/repo", "missing"), false);
	assert.deepEqual(await switchBranch(pi, "/repo", "dev"), { ok: true });
	assert.deepEqual(await switchBranch(pi, "/repo", "locked"), {
		ok: false,
		error: "conflict",
	});
	assert.deepEqual(await switchBranch(pi, "/repo", "empty"), {
		ok: false,
		error: "git switch empty 失败",
	});
});
