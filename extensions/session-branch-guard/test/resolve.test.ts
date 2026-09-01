import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, SessionManager } from "@earendil-works/pi-coding-agent";
import { createFakeContext, createFakePi } from "../../shared/test/fake-extension.ts";
import {
	continueChoice,
	notify,
	parseResolutionChoice,
	resolveBranchMismatch,
	switchChoice,
	targetRebindWriter,
} from "../resolve.ts";

const binding = {
	version: 1 as const,
	repoRoot: "/repo",
	gitBranch: "main",
	boundAt: "2026-01-01T00:00:00.000Z",
	source: "created" as const,
};

function gitPi(responses: Record<string, { code: number; stderr?: string }>) {
	const fake = createFakePi({
		async exec(_command: string, args: string[]) {
			const hit = responses[args.join(" ")];
			if (!hit) return { code: 1, stdout: "", stderr: "unexpected" };
			return { code: hit.code, stdout: "", stderr: hit.stderr ?? "" };
		},
	});
	return fake.pi;
}

test("parseResolutionChoice maps select labels and Esc", () => {
	assert.equal(parseResolutionChoice(undefined), "cancel");
	assert.equal(parseResolutionChoice("取消"), "cancel");
	assert.equal(parseResolutionChoice(switchChoice("main")), "switch");
	assert.equal(parseResolutionChoice(continueChoice("dev")), "rebind");
	assert.equal(parseResolutionChoice(continueChoice(undefined)), "rebind");
	assert.equal(parseResolutionChoice("其他选项"), "cancel");
});

test("resolveBranchMismatch switches, rebinds, or reports failures", async () => {
	const ctx = createFakeContext({ hasUI: true, cwd: "/repo" });
	const written: unknown[] = [];

	assert.equal(
		(
			await resolveBranchMismatch(
				{} as ExtensionAPI,
				ctx,
				binding,
				{ isRepo: false },
				{ write() {} },
			)
		).kind,
		"failed",
	);

	assert.equal(
		(
			await resolveBranchMismatch(
				{} as ExtensionAPI,
				ctx,
				binding,
				{ isRepo: true },
				{ write() {} },
			)
		).kind,
		"failed",
	);

	ctx.ui.select = async () => undefined;
	assert.equal(
		(
			await resolveBranchMismatch(
				{} as ExtensionAPI,
				ctx,
				binding,
				{ isRepo: true, repoRoot: "/repo", branch: "dev" },
				{ write() {} },
			)
		).kind,
		"cancelled",
	);

	ctx.ui.select = async () => continueChoice("dev");
	const rebound = await resolveBranchMismatch(
		{} as ExtensionAPI,
		ctx,
		binding,
		{ isRepo: true, repoRoot: "/repo", branch: "dev" },
		{
			write(next) {
				written.push(next);
			},
		},
	);
	assert.equal(rebound.kind, "rebound");
	assert.equal(written.length, 1);

	ctx.ui.select = async () => continueChoice(undefined);
	assert.equal(
		(
			await resolveBranchMismatch(
				{} as ExtensionAPI,
				ctx,
				binding,
				{ isRepo: true, repoRoot: "/repo" },
				{ write() {} },
			)
		).kind,
		"failed",
	);

	ctx.ui.select = async () => switchChoice("main");
	assert.equal(
		(
			await resolveBranchMismatch(
				gitPi({ "rev-parse --verify --quiet refs/heads/main": { code: 1 } }),
				ctx,
				binding,
				{ isRepo: true, repoRoot: "/repo", branch: "dev" },
				{ write() {} },
			)
		).kind,
		"failed",
	);
	assert.equal(
		(
			await resolveBranchMismatch(
				gitPi({
					"rev-parse --verify --quiet refs/heads/main": { code: 0 },
					"switch main": { code: 1, stderr: "conflict" },
				}),
				ctx,
				binding,
				{ isRepo: true, repoRoot: "/repo", branch: "dev" },
				{ write() {} },
			)
		).kind,
		"failed",
	);
	assert.deepEqual(
		await resolveBranchMismatch(
			gitPi({
				"rev-parse --verify --quiet refs/heads/main": { code: 0 },
				"switch main": { code: 0 },
			}),
			ctx,
			binding,
			{ isRepo: true, repoRoot: "/repo", branch: "dev" },
			{ write() {} },
		),
		{ kind: "switched", toBranch: "main" },
	);
});

test("resolveBranchMismatch reports writer persistence errors", async () => {
	const ctx = createFakeContext({ hasUI: true });
	ctx.ui.select = async () => continueChoice("dev");
	const outcome = await resolveBranchMismatch(
		{} as ExtensionAPI,
		ctx,
		binding,
		{ isRepo: true, repoRoot: "/repo", branch: "dev" },
		{
			write() {
				throw new Error("disk full");
			},
		},
	);
	assert.equal(outcome.kind, "failed");
	assert.match((outcome as { error: string }).error, /disk full/);

	const raw = await resolveBranchMismatch(
		{} as ExtensionAPI,
		ctx,
		binding,
		{ isRepo: true, repoRoot: "/repo", branch: "dev" },
		{
			write() {
				throw "nope";
			},
		},
	);
	assert.equal(raw.kind, "failed");
	assert.match((raw as { error: string }).error, /nope/);
});

test("notify writes stderr when there is no UI", () => {
	const ctx = createFakeContext({ hasUI: false });
	const writes: string[] = [];
	const original = process.stderr.write.bind(process.stderr);
	process.stderr.write = ((chunk: string) => {
		writes.push(String(chunk));
		return true;
	}) as typeof process.stderr.write;
	try {
		notify(ctx, "hello", "warning");
	} finally {
		process.stderr.write = original;
	}
	assert.match(writes.join(""), /\[session-branch\] hello/);
});

test("targetRebindWriter appends to the target session", () => {
	const recorded: Array<{ type: string; data: unknown }> = [];
	targetRebindWriter({
		appendCustomEntry(type: string, data: unknown) {
			recorded.push({ type, data });
		},
	} as SessionManager).write(binding);
	assert.equal(recorded[0]?.data, binding);
});
