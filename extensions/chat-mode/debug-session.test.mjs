import assert from "node:assert/strict";
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	createDebugSessionCollector,
	debugLogPathFromArtifact,
	MAX_DEBUG_LOG_BYTES,
	MAX_DEBUG_REQUEST_BYTES,
} from "./debug-session.ts";
import { mkdtemp } from "node:fs/promises";

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "debug-session-"));
	const collector = createDebugSessionCollector(join(root, "plan.md"));
	t.after(async () => {
		await collector.dispose();
		await rm(root, { recursive: true, force: true });
	});
	return { root, collector, connection: await collector.start() };
}

async function waitUntil(predicate, timeoutMs = 2000) {
	const deadline = Date.now() + timeoutMs;
	while (!(await predicate())) {
		if (Date.now() >= deadline) throw new Error("Timed out waiting for change");
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

test("derives the debug log from an artifact directory or plan path", () => {
	assert.equal(debugLogPathFromArtifact(join("tmp", "artifacts")), join(process.cwd(), "tmp", "artifacts", "debug.jsonl"));
	assert.equal(debugLogPathFromArtifact(join("tmp", "artifacts", "plan.md")), join(process.cwd(), "tmp", "artifacts", "debug.jsonl"));
});

test("secret endpoint enforces path, methods, size caps, and CORS", async (t) => {
	const { connection } = await fixture(t);
	const url = new URL(connection.endpoint);
	assert.equal(url.hostname, "127.0.0.1");
	assert.match(url.pathname, /^\/debug\/[a-f0-9]{64}$/);

	assert.equal((await fetch(new URL("/debug/wrong", url), { method: "POST", body: "x" })).status, 404);
	const wrongMethod = await fetch(url);
	assert.equal(wrongMethod.status, 405);
	assert.equal(wrongMethod.headers.get("allow"), "POST, OPTIONS");
	const options = await fetch(url, {
		method: "OPTIONS",
		headers: { origin: "http://localhost:3000" },
	});
	assert.equal(options.status, 204);
	assert.equal(
		options.headers.get("access-control-allow-origin"),
		"http://localhost:3000",
	);
	assert.match(options.headers.get("access-control-allow-methods"), /POST/);
	assert.equal(
		(
			await fetch(url, {
				method: "OPTIONS",
				headers: { origin: "https://example.com" },
			})
		).status,
		403,
	);
	assert.equal((await fetch(url, { method: "POST", body: "x".repeat(MAX_DEBUG_REQUEST_BYTES + 1) })).status, 413);
	assert.equal((await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{" })).status, 400);
	await writeFile(connection.logPath, Buffer.alloc(MAX_DEBUG_LOG_BYTES));
	assert.equal((await fetch(url, { method: "POST", body: "over-total-limit" })).status, 413);
});

test("concurrent JSON and text posts produce complete timestamped JSONL", async (t) => {
	const { collector, connection } = await fixture(t);
	const posts = Array.from({ length: 12 }, (_, index) => fetch(connection.endpoint, {
		method: "POST",
		headers: index % 2 === 0 ? { "content-type": "application/json" } : undefined,
		body: index % 2 === 0 ? JSON.stringify({ index, timestamp: "client" }) : `message-${index}`,
	}));
	const responses = await Promise.all(posts);
	assert.deepEqual(responses.map((response) => response.status), Array(12).fill(204));
	const lines = await collector.readLines();
	assert.equal(lines.length, 12);
	const records = lines.map((line) => JSON.parse(line));
	assert.equal(new Set(records.map((record) => record.index ?? record.message)).size, 12);
	for (const record of records) {
		assert.match(record.timestamp, /^\d{4}-\d\d-\d\dT/);
		assert.notEqual(record.timestamp, "client");
		assert.equal(JSON.stringify(record).includes(new URL(connection.endpoint).pathname.slice(7)), false);
	}
});

test("new reproduction steps clear runtime logs while manual clear preserves steps", async (t) => {
	const { collector, connection } = await fixture(t);
	const post = (body) =>
		fetch(connection.endpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});

	await post({ type: "reproduction_steps", steps: ["第一轮"] });
	await post({ hypothesis: "h1", value: 1 });
	assert.equal((await collector.readLines()).length, 2);

	await collector.clear();
	let records = (await collector.readLines()).map((line) => JSON.parse(line));
	assert.deepEqual(records.map((record) => record.steps), [["第一轮"]]);

	await post({ type: "reproduction_steps", steps: ["第二轮"] });
	records = (await collector.readLines()).map((line) => JSON.parse(line));
	assert.deepEqual(records.map((record) => record.steps), [["第二轮"]]);

	await collector.clearAll();
	assert.equal(await collector.readText(), "");
});

test("a new collector reuses the endpoint after reload", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "debug-session-reload-"));
	const planPath = join(root, "plan.md");
	const first = createDebugSessionCollector(planPath);
	const second = createDebugSessionCollector(planPath);
	const third = createDebugSessionCollector(planPath);
	t.after(async () => {
		await first.dispose();
		await second.dispose();
		await third.dispose();
		await rm(root, { recursive: true, force: true });
	});

	const original = await first.start();
	await first.stop();
	const restored = await second.start();
	assert.equal(restored.endpoint, original.endpoint);

	await second.stop();
	await second.forgetEndpoint();
	const fresh = await third.start();
	assert.notEqual(fresh.endpoint, original.endpoint);
});

test("clear, external append subscriptions, ensure, and stop are idempotent", async (t) => {
	const { root, collector, connection } = await fixture(t);
	assert.deepEqual(await collector.ensure(), connection);
	let changes = 0;
	const unsubscribe = collector.subscribe(() => changes++);
	await mkdir(root, { recursive: true });
	await appendFile(connection.logPath, '{"external":true}\n');
	await waitUntil(() => changes > 0);
	assert.match(await collector.readText(), /external/);
	await collector.clear();
	assert.equal(await collector.readText(), "");
	unsubscribe();
	await collector.stop();
	await collector.stop();
});
