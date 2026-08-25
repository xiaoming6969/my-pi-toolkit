import type { LiveSubagentRun, SubagentTurnResult } from "./registry.js";
import { writeRunJson } from "./rpc-protocol.js";

export function writeRpcReady(
	runDir: string,
	pid: number | undefined,
	run: LiveSubagentRun,
): void {
	writeRunJson(runDir, "ready.json", {
		pid,
		startedAt: run.startedAt,
		reusable: run.reusable,
	});
}

export function writeRpcResult(
	runDir: string,
	result: SubagentTurnResult,
): void {
	writeRunJson(runDir, "result.json", {
		output: result.output,
		model: result.model,
		turn: result.turn,
		reusable: result.reusable,
		completedAt: new Date().toISOString(),
	});
}

export function writeRpcExited(
	runDir: string,
	code: number | null,
	turnCount: number,
): void {
	writeRunJson(runDir, "exited.json", {
		exitCode: code ?? 1,
		turnCount,
		exitedAt: new Date().toISOString(),
	});
}
