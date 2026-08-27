import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
	collectBugEvidence,
	fetchRemoteTags,
	linkedObjectsForCommit,
	resolveCommitTag,
	scanLinkedCommits,
} from "../git/analysis.ts";
import {
	analyzeIntroducedCommitCandidates,
	selectIntroducedCommitCandidate,
} from "../git/bug-analysis.ts";
import {
	commitAll,
	createBranch,
	createBranchFromHead,
	git,
	popStash,
	readRepositoryState,
	refExists,
	stashAll,
} from "../git/repository.ts";
import { describeGitStatus } from "../git/workflow.ts";
import {
	TAPD_SESSION_STATE_TYPE,
	type TapdSessionState,
} from "../sessions/session-state.ts";
import { createFakeContext } from "../../shared/test/fake-extension.ts";
import { createFeatureGitRepo } from "./git-repo.ts";

const state: TapdSessionState = {
	version: 1,
	workspaceId: "99",
	itemId: "12",
	kind: "story",
	itemName: "登录",
	createdAt: "t",
	updatedAt: "t",
};

test("scanLinkedCommits and evidence read TAPD keywords on the feature branch", async (t) => {
	const dir = await createFeatureGitRepo(t);
	const commits = await scanLinkedCommits(dir, "main");
	assert.equal(commits.length, 1);
	assert.equal(commits[0]?.objects[0]?.shortId, "12");
	assert.equal(
		(await linkedObjectsForCommit(dir, commits[0]!.hash))[0]?.shortId,
		"12",
	);
	assert.match(await collectBugEvidence(dir, "main", commits), /候选提交/);
	const tagged = await resolveCommitTag(dir, "HEAD");
	assert.equal(tagged.matchType, "points-at");
	assert.equal(tagged.tag, "1.0.0");
	const parent = await git(dir, ["rev-parse", "HEAD~1"]);
	const contained = await resolveCommitTag(dir, parent);
	assert.equal(contained.matchType, "contains");
	assert.equal(contained.tag, "1.0.0");
});

test("analyzeIntroducedCommitCandidates ranks blamed lines", async (t) => {
	const dir = await createFeatureGitRepo(t);
	const candidates = await analyzeIntroducedCommitCandidates(dir, "main");
	assert.ok(candidates.length >= 1);
	await writeFile(join(dir, "new.ts"), "export const n = 1;\n");
	const { execFileSync } = await import("node:child_process");
	execFileSync("git", ["add", "new.ts"], { cwd: dir });
	execFileSync("git", ["commit", "-m", "feat --story=12@tapd-99"], { cwd: dir });
	const withNewFile = await analyzeIntroducedCommitCandidates(dir, "main");
	assert.ok(withNewFile.length >= 1);
	const ctx = createFakeContext({ cwd: dir });
	const selected = await selectIntroducedCommitCandidate(
		ctx,
		dir,
		"main",
		"8",
	);
	assert.ok(selected?.hash);
});

test("repository helpers create branches and commit local files", async (t) => {
	const dir = await createFeatureGitRepo(t);
	assert.equal(await refExists(dir, "refs/heads/feature"), true);
	assert.equal(await refExists(dir, "refs/heads/missing"), false);
	await createBranchFromHead(dir, "from-head");
	assert.equal(await refExists(dir, "refs/heads/from-head"), true);
	await createBranch(dir, "topic", "main");
	assert.equal(await refExists(dir, "refs/heads/topic"), true);
	const state = await readRepositoryState(dir);
	assert.equal(state.dirty, false);
	assert.match(state.originUrl, /gitlab\.example\.com/);
	await writeFile(join(dir, "extra.ts"), "export {}\n");
	const hash = await commitAll(dir, "chore: extra");
	assert.match(hash, /^[0-9a-f]{7,40}$/i);
	await writeFile(join(dir, "stash-me.ts"), "export {}\n");
	const stashRef = await stashAll(dir, "wip");
	assert.equal(stashRef, "stash@{0}");
	assert.equal((await readRepositoryState(dir)).dirty, false);
	await popStash(dir, stashRef);
	assert.equal((await readRepositoryState(dir)).dirty, true);
	assert.equal((await readRepositoryState(dir, false)).dirty, false);
	await writeFile(join(dir, "untracked-only.ts"), "export {}\n");
	const aborted = new AbortController();
	aborted.abort();
	await assert.rejects(() => git(dir, ["status"], aborted.signal), /已取消/);
	await assert.rejects(() => git(dir, ["not-a-git-subcommand"]), /Command failed/);
	const phases: string[] = [];
	await commitAll(dir, "chore: untracked", (phase) => phases.push(phase), true);
	assert.deepEqual(phases, ["stage", "commit"]);
});

test("describeGitStatus prints TAPD and repository fields", async (t) => {
	const dir = await createFeatureGitRepo(t);
	const ctx = createFakeContext({
		cwd: dir,
		entries: [
			{
				type: "custom",
				customType: TAPD_SESSION_STATE_TYPE,
				data: state,
			},
		],
	});
	const text = await describeGitStatus(ctx);
	assert.match(text, /story 12/);
	assert.match(text, /feature/);
	assert.match(text, /gitlab\.example\.com/);
});

test("selectIntroducedCommitCandidate warns when the branch has no blamed diff", async (t) => {
	const dir = await createFeatureGitRepo(t);
	const { execFileSync } = await import("node:child_process");
	execFileSync("git", ["checkout", "main"], { cwd: dir });
	const ctx = createFakeContext({ cwd: dir });
	assert.equal(
		await selectIntroducedCommitCandidate(ctx, dir, "main", "8"),
		undefined,
	);
	assert.match(ctx.notifies[0]?.message ?? "", /没有找到可靠的 git blame/);
});

test("fetchRemoteTags copies origin tags into the local cache", async (t) => {
	const dir = await createFeatureGitRepo(t);
	const { execFileSync } = await import("node:child_process");
	const { mkdtemp, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const bare = await mkdtemp(join(tmpdir(), "tapd-origin-"));
	t.after(() => rm(bare, { recursive: true, force: true }));
	execFileSync("git", ["clone", "--bare", dir, join(bare, "origin.git")]);
	execFileSync("git", ["remote", "set-url", "origin", join(bare, "origin.git")], {
		cwd: dir,
	});
	const previous = process.env.GIT_TERMINAL_PROMPT;
	process.env.GIT_TERMINAL_PROMPT = "0";
	try {
		await fetchRemoteTags(dir);
	} finally {
		if (previous === undefined) delete process.env.GIT_TERMINAL_PROMPT;
		else process.env.GIT_TERMINAL_PROMPT = previous;
	}
});

test("selectIntroducedCommitCandidate accepts a manual ancestor hash", async (t) => {
	const dir = await createFeatureGitRepo(t);
	const hash = await git(dir, ["rev-parse", "HEAD"]);
	const ctx = createFakeContext({ cwd: dir });
	(ctx.ui as { select: () => Promise<string> }).select = async () =>
		"手动输入 commit hash...";
	(ctx.ui as { input: () => Promise<string> }).input = async () => hash;
	const selected = await selectIntroducedCommitCandidate(ctx, dir, "main", "8");
	assert.equal(selected?.hash, hash);
});

test("selectIntroducedCommitCandidate covers skip, invalid, and missing hashes", async (t) => {
	const dir = await createFeatureGitRepo(t);
	const skipped = createFakeContext({ cwd: dir });
	(skipped.ui as { select: () => Promise<string> }).select = async () =>
		"未能定位（合入版本选择其他(历史缺陷)）";
	assert.equal(
		await selectIntroducedCommitCandidate(skipped, dir, "main", "8"),
		undefined,
	);

	const empty = createFakeContext({ cwd: dir });
	(empty.ui as { select: () => Promise<string> }).select = async () =>
		"手动输入 commit hash...";
	(empty.ui as { input: () => Promise<string> }).input = async () => "";
	assert.equal(await selectIntroducedCommitCandidate(empty, dir, "main", "8"), undefined);

	const invalid = createFakeContext({ cwd: dir });
	(invalid.ui as { select: () => Promise<string> }).select = async () =>
		"手动输入 commit hash...";
	(invalid.ui as { input: () => Promise<string> }).input = async () => "not-a-hash";
	await assert.rejects(
		() => selectIntroducedCommitCandidate(invalid, dir, "main", "8"),
		/格式无效/,
	);

	const missing = createFakeContext({ cwd: dir });
	(missing.ui as { select: () => Promise<string> }).select = async () =>
		"手动输入 commit hash...";
	(missing.ui as { input: () => Promise<string> }).input = async () => "aaaaaaaa";
	await assert.rejects(
		() => selectIntroducedCommitCandidate(missing, dir, "main", "8"),
		/不存在/,
	);
});
