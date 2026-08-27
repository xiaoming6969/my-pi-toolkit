import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	planPathFromSessionFile,
	watchDeletedSessionPlans,
} from "../session-plan-cleanup.ts";

async function waitUntil(predicate, timeoutMs = 2000) {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() >= deadline) throw new Error("Timed out waiting for cleanup");
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

test("deleting a session removes only its Chat Mode artifacts", async () => {
	const root = await mkdtemp(join(tmpdir(), "chat-mode-cleanup-"));
	const sessionDir = join(root, "--project--");
	const sessionId = "01a012c4-c944-7926-99ab-f519ffdf94e8";
	const sessionFile = join(sessionDir, `2026-01-01_${sessionId}.jsonl`);
	const planPath = join(sessionDir, sessionId, "plan.md");
	const debugPath = join(sessionDir, sessionId, "debug.jsonl");
	const endpointPath = join(sessionDir, sessionId, "debug-endpoint.json");
	const unrelated = join(sessionDir, sessionId, "keep.txt");
	mkdirSync(join(sessionDir, sessionId), { recursive: true });
	writeFileSync(
		sessionFile,
		`${JSON.stringify({ type: "session", version: 3, id: sessionId })}\n`,
	);
	writeFileSync(planPath, "plan");
	writeFileSync(debugPath, '{"message":"debug"}\n');
	writeFileSync(endpointPath, '{"port":1234,"token":"secret"}\n');
	writeFileSync(unrelated, "keep");

	const watcher = watchDeletedSessionPlans(sessionDir);
	assert.ok(watcher);
	try {
		unlinkSync(sessionFile);
		await waitUntil(
			() =>
				!existsSync(planPath) &&
				!existsSync(debugPath) &&
				!existsSync(endpointPath),
		);
		assert.equal(existsSync(unrelated), true);
	} finally {
		watcher.close();
		rmSync(root, { recursive: true, force: true });
	}
});

test("invalid session headers cannot select a plan path", async () => {
	const root = await mkdtemp(join(tmpdir(), "chat-mode-cleanup-"));
	const sessionFile = join(root, "invalid.jsonl");
	try {
		writeFileSync(sessionFile, '{"type":"session","id":"../outside"}\n');
		assert.equal(planPathFromSessionFile(sessionFile), undefined);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
