import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SUBAGENT_CHILD_ENV } from "../subagent/child-guard.ts";
import { runJsonSubagent } from "../subagent/json-runner.ts";

/**
 * A stand-in for `pi --mode json -p`: echoes the CLI args it received as a tool
 * call, streams NDJSON `message_end` events (including a partial trailing
 * line), and exits with the code requested through FAKE_EXIT.
 */
const FAKE_PI = `
const args = process.argv.slice(2);
const emit = (message) => process.stdout.write(JSON.stringify({ type: "message_end", message }) + "\\n");
process.stdout.write("not json\\n");
emit({ role: "user", content: [{ type: "text", text: args[args.length - 1] }] });
emit({ role: "assistant", content: [
  { type: "toolCall", name: "read", arguments: { path: "src/a.ts" } },
  { type: "toolCall", name: "broken", arguments: "nope" },
  { type: "toolCall" },
] });
if (process.env.FAKE_HANG === "1") { setInterval(() => {}, 1000); process.on("SIGTERM", () => process.exit(143)); }
else {
  process.stderr.write("warn: something\\n");
  const final = { type: "message_end", message: { role: "assistant", content: [
    { type: "text", text: "child env=" + process.env.${SUBAGENT_CHILD_ENV} + " tools=" + args[args.indexOf("--tools") + 1] + " ctx=" + args.includes("--no-context-files") },
  ] } };
  process.stdout.write(JSON.stringify(final));
  process.exit(Number(process.env.FAKE_EXIT ?? 0));
}
`;

async function fakePi(t: { after(fn: () => unknown): void }) {
	const dir = await mkdtemp(join(tmpdir(), "json-runner-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const script = join(dir, "fake-pi.cjs");
	await writeFile(script, FAKE_PI);
	return {
		cwd: dir,
		invocation: (args: string[]) => ({
			command: process.execPath,
			args: [script, ...args],
		}),
	};
}

const base = {
	title: "Fake Subagent",
	model: "fake/model",
	thinkingLevel: "low",
	task: "do the thing",
	systemPrompt: "system",
	tools: "read,grep",
	disableContextFiles: true,
};

test("runs a one-shot json child and parses its NDJSON stream", async (t) => {
	const { cwd, invocation } = await fakePi(t);
	const updates: number[] = [];
	const result = await runJsonSubagent({
		...base,
		cwd,
		invocation,
		onUpdate: ({ toolCalls }) => updates.push(toolCalls.length),
	});
	assert.equal(result.exitCode, 0);
	assert.equal(result.output, "child env=1 tools=read,grep ctx=true");
	assert.deepEqual(result.toolCalls, [
		{ name: "read", arguments: { path: "src/a.ts" } },
		{ name: "broken", arguments: {} },
	]);
	assert.match(result.stderr, /warn: something/);
	assert.deepEqual(updates, [0, 2, 2]);
});

test("reports child failures with exit code, model and stderr", async (t) => {
	const { cwd, invocation } = await fakePi(t);
	process.env.FAKE_EXIT = "3";
	t.after(() => delete process.env.FAKE_EXIT);
	await assert.rejects(
		runJsonSubagent({ ...base, cwd, invocation }),
		/Fake Subagent 运行失败（exit 3，model fake\/model）: warn: something/,
	);
});

test("aborting terminates the child and surfaces a cancellation", async (t) => {
	const { cwd, invocation } = await fakePi(t);
	process.env.FAKE_HANG = "1";
	t.after(() => delete process.env.FAKE_HANG);
	const controller = new AbortController();
	const pending = runJsonSubagent({
		...base,
		cwd,
		invocation,
		signal: controller.signal,
		onUpdate: () => controller.abort(),
	});
	await assert.rejects(pending, /Fake Subagent 已取消/);
	const preAborted = new AbortController();
	preAborted.abort();
	await assert.rejects(
		runJsonSubagent({ ...base, cwd, invocation, signal: preAborted.signal }),
		/已取消/,
	);
});

test("loadDefaultResources keeps extensions and skills enabled", async (t) => {
	const { cwd, invocation } = await fakePi(t);
	let seen: string[] = [];
	await runJsonSubagent({
		...base,
		cwd,
		loadDefaultResources: true,
		disableContextFiles: false,
		extensionPaths: ["/ext/a.ts"],
		invocation: (args) => {
			seen = args;
			return invocation(args);
		},
	});
	assert.equal(seen.includes("--no-extensions"), false);
	assert.equal(seen.includes("--no-skills"), false);
	assert.equal(seen.includes("--no-context-files"), false);
	assert.deepEqual(seen.slice(seen.indexOf("--extension"), seen.indexOf("--extension") + 2), [
		"--extension",
		"/ext/a.ts",
	]);
	assert.deepEqual(seen.slice(-3), ["--thinking", "low", "do the thing"]);
});
