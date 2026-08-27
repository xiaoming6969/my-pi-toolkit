import type { ChildProcessWithoutNullStreams } from "node:child_process";
import {
	acquireSubagentFollowup,
	notifySubagentRegistryChanged,
	registerLiveSubagent,
	removeLiveSubagent,
	type LiveSubagentRun,
	type SubagentRequestOptions,
	type SubagentTurnResult,
} from "./registry.js";
import { RpcProcessStream } from "./rpc-process-stream.js";
import { sendRpc } from "./rpc-protocol.js";
import { writeRpcExited, writeRpcReady } from "./rpc-run-metadata.js";
import { RpcSessionEvents } from "./rpc-session-events.js";
import { RpcSubagentTranscript } from "./rpc-transcript.js";
import {
	emitRpcTurnUpdate,
	RpcTurnQueue,
	type RpcTurnRequest,
} from "./rpc-turn-queue.js";
import type {
	TerminalSubagentOptions,
	TerminalSubagentResult,
} from "./terminal-runner.js";

export class RpcSubagentSession {
	private readonly turns = new RpcTurnQueue();
	private readonly transcript: RpcSubagentTranscript;
	private readonly processStream: RpcProcessStream;
	private status: LiveSubagentRun["status"] = "starting";
	private disposed = false;
	private readonly run: LiveSubagentRun;

	constructor(
		private readonly child: ChildProcessWithoutNullStreams,
		private readonly id: string,
		private readonly runDir: string,
		private readonly options: TerminalSubagentOptions,
	) {
		this.transcript = new RpcSubagentTranscript(
			runDir,
			() => this.turns.current?.turn,
			() => this.notifyTurn(),
		);
		this.run = {
			id,
			title: options.title,
			model: options.model,
			thinkingLevel: options.thinkingLevel,
			cwd: options.cwd,
			status: this.status,
			startedAt: new Date().toISOString(),
			parentSessionId: options.parentSessionId,
			reusable: options.keepOpen !== false,
			turnCount: 0,
			queuedCount: 0,
			lines: this.transcript.lines,
			entries: this.transcript.entries,
			request: (message, requestOptions) =>
				this.requestFollowup(message, requestOptions),
			abort: () => this.abortCurrent(),
			dispose: () => this.dispose(),
			subscribe: (listener) => this.transcript.subscribe(listener),
		};
		const events = new RpcSessionEvents({
			turns: this.turns,
			transcript: this.transcript,
			run: this.run,
			runDir,
			options,
			setStatus: (status) => this.setStatus(status),
			finishTurn: (request, result, error) =>
				this.finishTurn(request, result, error),
		});
		this.processStream = new RpcProcessStream(
			child,
			(event) => events.handle(event),
			(error) => this.handleError(error),
			(code, stderr) => this.handleClose(code, stderr),
		);
	}

	start(task: string): Promise<TerminalSubagentResult> {
		registerLiveSubagent(this.run);
		writeRpcReady(this.runDir, this.child.pid, this.run);
		this.processStream.attach();
		if (this.options.thinkingLevel)
			sendRpc(this.child, {
				type: "set_thinking_level",
				level: this.options.thinkingLevel,
			});
		return this.enqueue(task, true, {
			signal: this.options.signal,
			onUpdate: this.options.onUpdate,
		});
	}

	private requestFollowup(
		message: string,
		options?: SubagentRequestOptions,
	): Promise<SubagentTurnResult> {
		if (!this.run.reusable)
			return Promise.reject(new Error("该子 Agent 以一次性模式启动，不能复用"));
		if (this.disposed) return Promise.reject(new Error("该子 Agent 已退出，不能复用"));
		return this.enqueue(message, false, options);
	}

	private enqueue(
		message: string,
		initial: boolean,
		options: SubagentRequestOptions = {},
	): Promise<SubagentTurnResult> {
		const task = message.trim();
		if (!task) return Promise.reject(new Error("子 Agent 任务不能为空"));
		const { request, result } = this.turns.enqueue({
			task,
			initial,
			...options,
		});
		request.abortListener = () => this.abortRequest(request);
		if (request.signal?.aborted) request.abortListener();
		else
			request.signal?.addEventListener("abort", request.abortListener, {
				once: true,
			});
		this.syncTurnState();
		if (this.turns.current)
			emitRpcTurnUpdate(request, "queued", this.id, this.run.reusable);
		else void this.dispatchNext();
		return result;
	}

	private async dispatchNext(): Promise<void> {
		if (this.disposed) return;
		const request = this.turns.activateNext();
		if (!request) return;
		this.syncTurnState();
		this.setStatus("running");
		try {
			if (!request.initial) {
				const release = await acquireSubagentFollowup(this.id);
				if (this.disposed || this.turns.current !== request) {
					release();
					return;
				}
				request.release = release;
			}
			if (request.cancelled) {
				this.finishTurn(request);
				return;
			}
			this.run.turnCount = request.turn;
			this.transcript.resetAssistant();
			this.transcript.entries.push({ kind: "user", text: request.task });
			this.transcript.append(`YOU: ${request.task}`);
			sendRpc(this.child, {
				id: request.commandId,
				type: "prompt",
				message: request.task,
			});
			request.promptSent = true;
			request.startedAt = new Date().toISOString();
			this.syncTurnState();
			emitRpcTurnUpdate(request, "running", this.id, this.run.reusable);
		} catch (error) {
			if (this.disposed || this.turns.current !== request) return;
			const failure = asError(error);
			this.setStatus("failed");
			this.transcript.append(`ERROR: ${failure.message}`);
			this.finishTurn(request, undefined, failure);
		}
	}

	private abortRequest(request: RpcTurnRequest): void {
		const error = new Error("子 Agent 已取消");
		const state = this.turns.cancel(request, error, {
			delayMs: this.options.abortSettleTimeoutMs ?? 5_000,
			onTimeout: () => this.dispose(new Error("子 Agent 取消后未结束")),
		});
		this.syncTurnState();
		if (state === "queued" && request.initial) this.dispose(error);
		if (state !== "active") return;
		if (request.initial) this.dispose(error);
		else if (request.promptSent) sendRpc(this.child, { type: "abort" }); else {
			this.setStatus("completed");
			this.finishTurn(request);
		}
	}

	private abortCurrent(): void {
		const request = this.turns.current;
		if (request) this.abortRequest(request);
		else sendRpc(this.child, { type: "abort" });
	}

	private finishTurn(
		request: RpcTurnRequest,
		result?: SubagentTurnResult,
		error?: Error,
	): void {
		if (!this.turns.completeActive(request, result, error)) return;
		this.syncTurnState();
		if (this.run.reusable) {
			void this.dispatchNext();
			return;
		}
		this.turns.rejectAll(new Error("该子 Agent 以一次性模式启动，不能复用"));
		this.dispose();
	}

	private dispose(error = new Error("子 Agent 已终止")): void {
		if (this.disposed) return;
		this.disposed = true;
		this.turns.rejectAll(error);
		this.syncTurnState();
		sendRpc(this.child, { type: "abort" });
		this.child.stdin.end();
		setTimeout(() => this.child.kill("SIGTERM"), 1000).unref?.();
	}

	private syncTurnState(): void {
		this.run.queuedCount = this.turns.queuedCount;
		this.run.turnStartedAt = this.turns.current?.startedAt;
		this.transcript.touch();
	}

	private setStatus(status: LiveSubagentRun["status"]): void {
		if (this.status === status) return;
		this.status = status;
		this.run.status = status;
		notifySubagentRegistryChanged(this.run);
	}

	private notifyTurn(): void {
		const request = this.turns.current;
		if (request)
			emitRpcTurnUpdate(request, this.status, this.id, this.run.reusable);
	}

	private handleError(error: Error): void {
		this.setStatus("failed");
		this.transcript.append(`ERROR: ${error.message}`);
		this.dispose(error);
	}

	private handleClose(code: number | null, stderr: string): void {
		this.disposed = true;
		const hadPendingTurn = Boolean(this.turns.current);
		const error = new Error(stderr || `子 Agent 进程已退出（${code ?? 1}）`);
		this.turns.rejectAll(error);
		removeLiveSubagent(this.id);
		writeRpcExited(this.runDir, code, this.run.turnCount);
		if (hadPendingTurn || this.status !== "completed") this.setStatus("failed");
		this.transcript.append(`Process exited (${code ?? 1})`);
	}
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
