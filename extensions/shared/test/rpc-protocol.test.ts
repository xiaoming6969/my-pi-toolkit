import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	assistantText,
	parseRpcEvent,
	writeRunJson,
} from "../subagent/rpc-protocol.ts";
import {
	writeRpcExited,
	writeRpcReady,
	writeRpcResult,
} from "../subagent/rpc-run-metadata.ts";

test("parseRpcEvent and assistantText ignore malformed records", () => {
	assert.equal(parseRpcEvent(""), undefined);
	assert.equal(parseRpcEvent("{"), undefined);
	assert.equal(parseRpcEvent('{"type":"agent_start"}')?.type, "agent_start");
	assert.equal(assistantText({ role: "user", content: "x" }), "");
	assert.equal(
		assistantText({
			role: "assistant",
			content: [{ type: "text", text: "hi" }, { type: "image" }],
		}),
		"hi",
	);
});

test("writeRunJson and rpc metadata files persist ready/result/exit", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "rpc-meta-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	writeRunJson(dir, "custom.json", { ok: true });
	assert.deepEqual(JSON.parse(await readFile(join(dir, "custom.json"), "utf8")), {
		ok: true,
	});
	writeRpcReady(dir, 12, {
		startedAt: "t",
		reusable: true,
	} as never);
	writeRpcResult(dir, {
		output: "done",
		model: "m",
		turn: 1,
		reusable: true,
	} as never);
	writeRpcExited(dir, 0, 1);
	assert.equal(JSON.parse(await readFile(join(dir, "ready.json"), "utf8")).pid, 12);
	assert.equal(JSON.parse(await readFile(join(dir, "result.json"), "utf8")).output, "done");
	assert.equal(JSON.parse(await readFile(join(dir, "exited.json"), "utf8")).exitCode, 0);
});
