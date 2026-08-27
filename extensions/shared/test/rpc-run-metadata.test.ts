import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	writeRpcExited,
	writeRpcReady,
	writeRpcResult,
} from "../subagent/rpc-run-metadata.ts";
import type { LiveSubagentRun } from "../subagent/registry.ts";

test("RPC run metadata writes ready, result, and default exit code", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "rpc-meta-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	writeRpcReady(dir, undefined, {
		startedAt: "t0",
		reusable: false,
	} as LiveSubagentRun);
	writeRpcResult(dir, {
		output: "done",
		toolCalls: [],
		runDir: dir,
		subagentId: "a",
		reusable: true,
		turn: 2,
	});
	writeRpcExited(dir, null, 2);
	assert.equal(JSON.parse(await readFile(join(dir, "ready.json"), "utf8")).pid, undefined);
	assert.equal(JSON.parse(await readFile(join(dir, "result.json"), "utf8")).turn, 2);
	assert.equal(JSON.parse(await readFile(join(dir, "exited.json"), "utf8")).exitCode, 1);
});
