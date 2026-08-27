import type {
	SubagentToolCall,
	SubagentTurnResult,
	SubagentTurnUpdate,
} from "./registry.js";

export interface RpcTurnRequest {
	turn: number;
	task: string;
	initial: boolean;
	signal?: AbortSignal;
	onUpdate?: (update: SubagentTurnUpdate) => void;
	toolCalls: SubagentToolCall[];
	output: string;
	promptSent: boolean;
	startedAt?: string;
	cancelled: boolean;
	responded: boolean;
	commandId: string;
	abortListener?: () => void;
	settleTimer?: ReturnType<typeof setTimeout>;
	release?: () => void;
	resolveResult: (result: SubagentTurnResult) => void;
	rejectResult: (error: Error) => void;
}

export function emitRpcTurnUpdate(
	request: RpcTurnRequest,
	status: string,
	subagentId: string,
	reusable: boolean,
): void {
	try {
		request.onUpdate?.({
			status,
			toolCalls: [...request.toolCalls],
			subagentId,
			reusable,
			turn: request.turn,
		});
	} catch {
		// UI progress must never interrupt child execution.
	}
}

export class RpcTurnQueue {
	private readonly queued: RpcTurnRequest[] = [];
	private nextTurn = 0;
	private active?: RpcTurnRequest;

	get current(): RpcTurnRequest | undefined {
		return this.active;
	}

	get queuedCount(): number {
		return this.queued.length;
	}

	enqueue(options: {
		task: string;
		initial: boolean;
		signal?: AbortSignal;
		onUpdate?: (update: SubagentTurnUpdate) => void;
	}): { request: RpcTurnRequest; result: Promise<SubagentTurnResult> } {
		let resolveResult!: (result: SubagentTurnResult) => void;
		let rejectResult!: (error: Error) => void;
		const result = new Promise<SubagentTurnResult>((resolve, reject) => {
			resolveResult = resolve;
			rejectResult = reject;
		});
		const turn = ++this.nextTurn;
		const request: RpcTurnRequest = {
			...options,
			turn,
			toolCalls: [],
			output: "",
			promptSent: false,
			cancelled: false,
			responded: false,
			commandId: `prompt-${turn}`,
			resolveResult,
			rejectResult,
		};
		this.queued.push(request);
		return { request, result };
	}

	activateNext(): RpcTurnRequest | undefined {
		if (this.active) return undefined;
		this.active = this.queued.shift();
		return this.active;
	}

	removeQueued(request: RpcTurnRequest, error: Error): boolean {
		const index = this.queued.indexOf(request);
		if (index < 0) return false;
		this.queued.splice(index, 1);
		this.rejectResponse(request, error);
		this.cleanup(request);
		return true;
	}

	rejectResponse(request: RpcTurnRequest, error: Error): void {
		if (request.responded) return;
		request.responded = true;
		request.rejectResult(error);
	}

	cancel(
		request: RpcTurnRequest,
		error: Error,
		settleTimeout?: { delayMs: number; onTimeout: () => void },
	): "queued" | "active" | undefined {
		if (this.removeQueued(request, error)) return "queued";
		if (this.active !== request) return undefined;
		request.cancelled = true;
		this.rejectResponse(request, error);
		request.onUpdate = undefined;
		if (!request.initial && request.promptSent && settleTimeout)
			this.armSettleTimeout(
				request,
				settleTimeout.delayMs,
				settleTimeout.onTimeout,
			);
		return "active";
	}

	armSettleTimeout(
		request: RpcTurnRequest,
		delayMs: number,
		onTimeout: () => void,
	): void {
		if (this.active !== request) return;
		if (request.settleTimer) clearTimeout(request.settleTimer);
		request.settleTimer = setTimeout(() => {
			request.settleTimer = undefined;
			if (this.active === request) onTimeout();
		}, delayMs);
		request.settleTimer.unref?.();
	}

	completeActive(
		request: RpcTurnRequest,
		result?: SubagentTurnResult,
		error?: Error,
	): boolean {
		if (this.active !== request) return false;
		if (!request.responded) {
			request.responded = true;
			if (error) request.rejectResult(error);
			else if (result) request.resolveResult(result);
			else request.rejectResult(new Error("子 Agent 未返回结果"));
		}
		this.cleanup(request);
		this.active = undefined;
		return true;
	}

	rejectAll(error: Error): void {
		const requests = [
			...(this.active ? [this.active] : []),
			...this.queued,
		];
		this.active = undefined;
		this.queued.length = 0;
		for (const request of requests) {
			this.rejectResponse(request, error);
			this.cleanup(request);
		}
	}

	private cleanup(request: RpcTurnRequest): void {
		if (request.abortListener)
			request.signal?.removeEventListener("abort", request.abortListener);
		request.abortListener = undefined;
		if (request.settleTimer) clearTimeout(request.settleTimer);
		request.settleTimer = undefined;
		try {
			request.release?.();
		} catch {
			// A lock release must not prevent the next queued turn.
		}
		request.release = undefined;
	}
}
