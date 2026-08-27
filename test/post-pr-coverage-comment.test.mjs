import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { REPORT_MARKER } from "../scripts/coverage-report.mjs";
import {
	readPullRequestNumber,
	upsertPullRequestComment,
} from "../scripts/post-pr-coverage-comment.mjs";

test("readPullRequestNumber reads the GitHub event payload", async () => {
	const dir = mkdtempSync(join(tmpdir(), "gh-event-"));
	const eventPath = join(dir, "event.json");
	writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 11 } }));
	assert.equal(await readPullRequestNumber(eventPath), 11);
	writeFileSync(eventPath, JSON.stringify({}));
	await assert.rejects(() => readPullRequestNumber(eventPath), /没有 pull_request/);
	await assert.rejects(
		() => readPullRequestNumber(join(dir, "missing.json")),
		/ENOENT/,
	);
});

test("upsertPullRequestComment updates an existing coverage comment", async (t) => {
	const calls = [];
	t.mock.method(globalThis, "fetch", async (input, init) => {
		const url = String(input);
		calls.push({ url, method: init?.method ?? "GET", body: init?.body });
		if (url.includes("/comments?") && !url.includes("/comments/")) {
			return new Response(
				JSON.stringify([{ id: 9, body: `${REPORT_MARKER}\nold` }]),
				{ status: 200 },
			);
		}
		return new Response(JSON.stringify({ id: 9 }), { status: 200 });
	});
	const result = await upsertPullRequestComment({
		repo: "org/repo",
		token: "t",
		issue: 11,
		body: `${REPORT_MARKER}\nnew`,
	});
	assert.equal(result.updated, true);
	assert.equal(result.id, 9);
	assert.equal(calls.at(-1)?.method, "PATCH");
});

test("upsertPullRequestComment creates a comment when none exists", async (t) => {
	t.mock.method(globalThis, "fetch", async (input, init) => {
		const url = String(input);
		if (url.includes("/comments?") && !url.includes("/comments/")) {
			return new Response("[]", { status: 200 });
		}
		assert.equal(init?.method, "POST");
		return new Response(JSON.stringify({ id: 12 }), { status: 200 });
	});
	const result = await upsertPullRequestComment({
		repo: "org/repo",
		token: "t",
		issue: 11,
		body: `${REPORT_MARKER}\nnew`,
	});
	assert.equal(result.updated, false);
	assert.equal(result.id, 12);
});
