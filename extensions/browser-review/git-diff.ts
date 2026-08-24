import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
	git,
	readRepositoryRoot,
	refExists,
} from "../tapd/git/repository.js";
import { parseUnifiedDiff } from "./diff-parser.js";
import type { BrowserReviewSource } from "./types.js";

export type BrowserDiffScope = "uncommitted" | "branch";
const MAX_UNTRACKED_BYTES = 256 * 1024;
const MAX_DIFF_BYTES = 5 * 1024 * 1024;

async function untrackedPatch(root: string): Promise<string> {
	const names = (await git(root, ["ls-files", "--others", "--exclude-standard", "-z"]))
		.split("\0")
		.filter(Boolean);
	const patches: string[] = [];
	for (const name of names) {
		const path = join(root, name);
		const info = await stat(path);
		if (!info.isFile()) continue;
		if (info.size > MAX_UNTRACKED_BYTES) {
			patches.push(`diff --git a/${name} b/${name}\n[untracked file omitted: ${info.size} bytes]`);
			continue;
		}
		const content = await readFile(path);
		if (content.includes(0)) {
			patches.push(`diff --git a/${name} b/${name}\n[untracked binary file omitted]`);
			continue;
		}
		const text = content.toString("utf8");
		const lines = text.split(/\r?\n/);
		if (lines.at(-1) === "") lines.pop();
		const body = lines.map((line) => `+${line}`).join("\n");
		patches.push([
			`diff --git a/${name} b/${name}`,
			"new file mode 100644",
			"--- /dev/null",
			`+++ b/${name}`,
			`@@ -0,0 +1,${lines.length} @@`,
			body,
		].join("\n"));
	}
	return patches.join("\n");
}

export async function collectBrowserDiff(
	cwd: string,
	scope: BrowserDiffScope,
	baseRef = "origin/dev",
): Promise<BrowserReviewSource> {
	const root = await readRepositoryRoot(cwd);
	if (!(await refExists(root, "HEAD"))) throw new Error("当前仓库还没有 HEAD 提交");
	let comparison = "HEAD";
	if (scope === "branch") {
		if (!(await refExists(root, baseRef))) throw new Error(`审核基础分支不存在: ${baseRef}`);
		comparison = await git(root, ["merge-base", baseRef, "HEAD"]);
	}
	const [tracked, untracked] = await Promise.all([
		git(root, ["diff", "--no-color", "--find-renames", comparison, "--"]),
		untrackedPatch(root),
	]);
	const patch = [tracked, untracked].filter(Boolean).join("\n");
	if (!patch) throw new Error("没有可审核的代码修改");
	if (Buffer.byteLength(patch) > MAX_DIFF_BYTES) {
		throw new Error("代码 diff 超过 5 MiB，请缩小审核范围");
	}
	return {
		kind: "code",
		title: "CODE REVIEW",
		subtitle: `${root} · ${scope}${scope === "branch" ? ` · base ${baseRef}` : ""}`,
		lines: parseUnifiedDiff(patch),
	};
}
