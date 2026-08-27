import type {
	LiveSubagentRun,
	SubagentTurnResult,
} from "./registry.js";
import type { RpcEvent } from "./rpc-protocol.js";
import { writeRpcResult } from "./rpc-run-metadata.js";
import type { RpcSubagentTranscript } from "./rpc-transcript.js";
import type { RpcTurnQueue, RpcTurnRequest } from "./rpc-turn-queue.js";
import type { TerminalSubagentOptions } from "./terminal-runner.js";

interface RpcSessionEventOptions {
	turns: RpcTurnQueue;
	transcript: RpcSubagentTranscript;
	run: LiveSubagentRun;
	runDir: string;
	options: TerminalSubagentOptions;
	setStatus: (status: LiveSubagentRun["status"]) => void;
	finishTurn: (
		request: RpcTurnRequest,
		result?: SubagentTurnResult,
		error?: Error,
	) => void;
}

export class RpcSessionEvents {
	constructor(private readonly state: RpcSessionEventOptions) {}

	handle(event: RpcEvent): void {
		if (event.type === "response") return this.handleResponse(event);
		const request = this.state.turns.current;
		const transcriptEvent = this.state.transcript.handleEvent(event, request);
		if (transcriptEvent) {
			if (request && transcriptEvent.assistantText)
				request.output = transcriptEvent.assistantText;
			return;
		}
		if (event.type === "agent_start") {
			this.state.transcript.resetAssistant();
			this.state.setStatus("running");
			this.state.transcript.append("Agent started");
		} else if (event.type === "agent_settled") this.handleSettled();
		else if (event.type === "extension_error")
			this.state.transcript.append(
				`ERROR: ${event.error ?? "extension error"}`,
			);
	}

	private handleResponse(event: RpcEvent): void {
		const request = this.state.turns.current;
		if (!request || event.id !== request.commandId || event.success !== false)
			return;
		const error = new Error(event.error ?? "子 Agent 拒绝了任务");
		this.state.setStatus("failed");
		this.state.transcript.append(`ERROR: ${error.message}`);
		this.state.finishTurn(request, undefined, error);
	}

	private handleSettled(): void {
		this.state.transcript.append("Agent settled");
		const request = this.state.turns.current;
		if (!request) return;
		if (request.cancelled) {
			this.state.setStatus("completed");
			this.state.finishTurn(request);
			return;
		}
		if (!request.output) {
			const error = new Error("子 Agent 已结束但未返回文本结果");
			this.state.setStatus("failed");
			this.state.finishTurn(request, undefined, error);
			return;
		}
		const result: SubagentTurnResult = {
			output: request.output,
			model: this.state.options.model,
			toolCalls: [...request.toolCalls],
			runDir: this.state.runDir,
			subagentId: this.state.run.id,
			reusable: this.state.run.reusable,
			turn: request.turn,
		};
		this.state.setStatus("completed");
		writeRpcResult(this.state.runDir, result);
		this.state.finishTurn(request, result);
	}
}
