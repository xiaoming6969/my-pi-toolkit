import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startBackgroundSubagent } from "../../../shared/subagent/background.ts";
import {
	registerLiveSubagent,
	removeLiveSubagent,
	type LiveSubagentRun,
} from "../../../shared/subagent/registry.ts";
import { latestSessionFile } from "../../../shared/subagent/run-paths.ts";
import { resolveResumeSource } from "../resume.ts";

let counter = 0;
const nextId = () => `resume-${process.pid}-${++counter}`;

async function runDirWithSession(root: string, id: string, parentSessionId?: string) {
	const runDir = join(root, id);
	await mkdir(join(runDir, "sessions"), { recursive: true });
	await writeFile(join(runDir, "sessions", "2026-01-01T00-00-00_a.jsonl"), "{}\n");
	if (parentSessionId)
		await writeFile(join(runDir, "launch.json"), JSON.stringify({ parentSessionId }));
	return runDir;
}

function fakeRun(overrides: Partial<LiveSubagentRun>): LiveSubagentRun {
	return {
		id: "x",
		title: "t",
		model: "m",
		cwd: process.cwd(),
		status: "completed",
		startedAt: "2026-01-01T00:00:00.000Z",
		parentSessionId: "s1",
		reusable: true,
		turnCount: 1,
		lines: [],
		entries: [],
		request: async () => {
			throw new Error("unused");
		},
		abort() {},
		dispose() {},
		subscribe: () => () => {},
		...overrides,
	};
}

test("latestSessionFile prefers the most recently written branch", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "resume-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const runDir = await runDirWithSession(root, "run");
	const older = join(runDir, "sessions", "2026-01-01T00-00-00_a.jsonl");
	const newer = join(runDir, "sessions", "2026-01-01T00-00-00_0.jsonl");
	await writeFile(newer, "{}\n");
	await utimes(older, new Date(1_000_000), new Date(1_000_000));
	await utimes(newer, new Date(2_000_000), new Date(2_000_000));
	assert.equal(latestSessionFile(runDir), newer);
	assert.equal(latestSessionFile(join(root, "missing")), undefined);
});

test("settled live runs and retained run dirs from this session can be resumed", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "resume-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const runDirFor = (id: string) => join(root, id);

	const liveId = nextId();
	await runDirWithSession(root, liveId);
	const live = fakeRun({ id: liveId, status: "running" });
	registerLiveSubagent(live);
	try {
		assert.throws(() => resolveResumeSource(liveId, "s1", runDirFor), /仍在运行/);
		assert.throws(() => resolveResumeSource(liveId, "s2", runDirFor), /其他主会话/);
		live.status = "completed";
		const source = resolveResumeSource(` ${liveId} `, "s1", runDirFor);
		assert.equal(source.subagentId, liveId);
		assert.ok(source.sessionFile.endsWith(".jsonl"));
	} finally {
		removeLiveSubagent(liveId);
	}

	const retained = nextId();
	await runDirWithSession(root, retained, "s1");
	assert.equal(resolveResumeSource(retained, "s1", runDirFor).subagentId, retained);
	assert.throws(() => resolveResumeSource(retained, "s9", runDirFor), /其他主会话/);

	const noLaunch = nextId();
	await runDirWithSession(root, noLaunch);
	assert.equal(resolveResumeSource(noLaunch, "any", runDirFor).subagentId, noLaunch);

	assert.throws(() => resolveResumeSource("ghost", "s1", runDirFor), /未找到可续接/);
	assert.throws(() => resolveResumeSource("  ", "s1", runDirFor), /不能为空/);
});

test("background jobs must settle and leave a session before resuming", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "resume-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const runDirFor = (id: string) => join(root, id);
	const id = nextId();
	let finish!: () => void;
	const job = startBackgroundSubagent({
		id,
		title: "bg",
		parentSessionId: "s1",
		run: () =>
			new Promise((resolve) => {
				finish = () =>
					resolve({ output: "", model: "m", toolCalls: [], reusable: false, turn: 1, exitCode: 0, stderr: "" });
			}),
	});
	assert.throws(() => resolveResumeSource(id, "s1", runDirFor), /仍在运行/);
	assert.throws(() => resolveResumeSource(id, "s2", runDirFor), /其他主会话/);
	finish();
	await job.settled;
	assert.throws(() => resolveResumeSource(id, "s1", runDirFor), /没有可续接的 session/);
	await runDirWithSession(root, id);
	assert.equal(resolveResumeSource(id, "s1", runDirFor).subagentId, id);
});
