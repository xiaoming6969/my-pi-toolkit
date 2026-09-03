import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getPiInvocation } from "../subagent/pi-invocation.ts";

const existingScript = fileURLToPath(import.meta.url);

test("re-runs the parent's entry script when it exists on disk", () => {
	assert.deepEqual(
		getPiInvocation(["--mode", "rpc"], {
			entryScript: existingScript,
			execPath: "/usr/bin/node",
		}),
		{ command: "/usr/bin/node", args: [existingScript, "--mode", "rpc"] },
	);
});

test("falls back to pi on PATH under node or bun without a real script", () => {
	for (const execPath of ["/usr/bin/node", "/opt/bun/bun.exe"]) {
		assert.deepEqual(
			getPiInvocation(["-p"], { entryScript: "/no/such/script", execPath }),
			{ command: "pi", args: ["-p"] },
		);
	}
	assert.deepEqual(
		getPiInvocation([], { entryScript: "/$bunfs/root/pi", execPath: "/bin/node" }),
		{ command: "pi", args: [] },
	);
});

test("re-execs a compiled Pi binary directly", () => {
	assert.deepEqual(
		getPiInvocation(["--version"], {
			entryScript: undefined,
			execPath: "/opt/pi/pi",
		}),
		{ command: "/opt/pi/pi", args: ["--version"] },
	);
});

test("defaults to the current process host", () => {
	const invocation = getPiInvocation();
	assert.ok(invocation.command.length > 0);
	assert.ok(Array.isArray(invocation.args));
});
