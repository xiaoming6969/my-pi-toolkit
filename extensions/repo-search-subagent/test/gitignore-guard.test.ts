import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import gitignoreGuard from "../gitignore-guard.ts";

function git(cwd: string, ...args: string[]) {
	execFileSync("git", args, { cwd, encoding: "utf8" });
}

test("gitignore guard blocks ignored paths and ignores unrelated tools", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "repo-search-guard-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	git(root, "init", "-b", "main");
	await writeFile(join(root, ".gitignore"), "secret.txt\nignored/\n");
	await writeFile(join(root, "ok.ts"), "export {}\n");
	await writeFile(join(root, "secret.txt"), "nope\n");
	await mkdir(join(root, "ignored"), { recursive: true });
	await writeFile(join(root, "ignored", "x.ts"), "x\n");

	let handler:
		| ((
				event: { toolName: string; input: unknown },
				ctx: ExtensionContext,
		  ) => Promise<unknown> | unknown)
		| undefined;
	gitignoreGuard({
		on(event, fn) {
			if (event === "tool_call") handler = fn;
		},
	} as ExtensionAPI);
	assert.ok(handler);
	const ctx = { cwd: root } as ExtensionContext;

	assert.equal(await handler({ toolName: "bash", input: { path: "secret.txt" } }, ctx), undefined);
	assert.equal(await handler({ toolName: "read", input: { path: "ok.ts" } }, ctx), undefined);
	const blocked = (await handler(
		{ toolName: "read", input: { path: "secret.txt" } },
		ctx,
	)) as { block: boolean; reason: string };
	assert.equal(blocked.block, true);
	assert.match(blocked.reason, /\.gitignore/);
	assert.equal(
		(
			(await handler(
				{ toolName: "grep", input: { path: join("ignored", "x.ts") } },
				ctx,
			)) as { block: boolean }
		).block,
		true,
	);
});
