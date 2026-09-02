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
	candidateFromHash,
	resolveIntroducedCommit,
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

test("candidateFromHash requires an ancestor commit of HEAD", async (t) => {
	const dir = await createFeatureGitRepo(t);
	const hash = await git(dir, ["rev-parse", "HEAD"]);
	const resolved = await candidateFromHash(dir, hash);
	assert.equal(resolved.hash, hash);
	assert.match(resolved.shortHash, /^[0-9a-f]{7,40}$/i);

	await assert.rejects(() => candidateFromHash(dir, "not-a-hash"), /Command failed/);
	await assert.rejects(() => candidateFromHash(dir, "aaaaaaaa"), /Command failed/);

	const { execFileSync } = await import("node:child_process");
	execFileSync("git", ["checkout", "main"], { cwd: dir });
	await writeFile(join(dir, "only-main.ts"), "export {}\n");
	execFileSync("git", ["add", "only-main.ts"], { cwd: dir });
	execFileSync("git", ["commit", "-m", "only on main"], { cwd: dir });
	const mainOnly = await git(dir, ["rev-parse", "HEAD"]);
	execFileSync("git", ["checkout", "feature"], { cwd: dir });
	await assert.rejects(() => candidateFromHash(dir, mainOnly), /Command failed/);
});

test("resolveIntroducedCommit treats invalid hashes as unlocated", async (t) => {
	const dir = await createFeatureGitRepo(t);
	const hash = await git(dir, ["rev-parse", "HEAD"]);
	assert.equal((await resolveIntroducedCommit(dir, hash))?.hash, hash);
	assert.equal(await resolveIntroducedCommit(dir, "未能定位"), undefined);
	assert.equal(await resolveIntroducedCommit(dir, "not-a-hash"), undefined);
	assert.equal(await resolveIntroducedCommit(dir, "aaaaaaaa"), undefined);
	assert.equal(await resolveIntroducedCommit(dir, undefined), undefined);
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
