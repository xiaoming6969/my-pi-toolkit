import { appendFileSync } from "node:fs";
import { join } from "node:path";
import type { SubagentTranscriptEntry } from "./registry.js";
import { RpcAssistantStream } from "./rpc-assistant-stream.js";
import type { RpcEvent } from "./rpc-protocol.js";
import type { RpcTurnRequest } from "./rpc-turn-queue.js";

export class RpcSubagentTranscript {
	readonly lines: string[] = [];
	readonly entries: SubagentTranscriptEntry[] = [];
	private readonly listeners = new Set<() => void>();
	private readonly assistantStream = new RpcAssistantStream(
		this.entries,
		() => this.changed(),
	);

	constructor(
		private readonly runDir: string,
		private readonly currentTurn: () => number | undefined,
		private readonly onChange: () => void,
	) {}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	touch(): void {
		this.changed();
	}

	append(line: string): void {
		this.lines.push(line);
		appendFileSync(
			join(this.runDir, "transcript.jsonl"),
			`${JSON.stringify({
				at: new Date().toISOString(),
				turn: this.currentTurn(),
				line,
			})}\n`,
			{ encoding: "utf8", mode: 0o600 },
		);
		while (this.lines.length > 1000) this.lines.shift();
		this.changed();
	}

	resetAssistant(): void {
		this.assistantStream.reset();
	}

	handleEvent(
		event: RpcEvent,
		request: RpcTurnRequest | undefined,
	): { assistantText?: string } | undefined {
		switch (event.type) {
			case "tool_execution_start":
				if (request) this.startTool(event, request);
				return {};
			case "tool_execution_end":
				this.finishTool(event);
				return {};
			case "message_start":
				this.assistantStream.start(event.message);
				return {};
			case "message_update":
				if (event.message !== undefined)
					this.assistantStream.update(event.message);
				else this.assistantStream.apply(event.assistantMessageEvent);
				return {};
			case "message_end": {
				const text = this.assistantStream.finish(event.message);
				if (text !== undefined)
					this.append(
						text ? `AGENT: ${text}` : "Assistant message completed",
					);
				return { assistantText: text };
			}
			default:
				return undefined;
		}
	}

	private startTool(event: RpcEvent, request: RpcTurnRequest): void {
		if (!event.toolName) return;
		const args = event.args ?? {};
		request.toolCalls.push({ name: event.toolName, arguments: args });
		this.entries.push({
			kind: "tool",
			id: event.toolCallId ?? `${event.toolName}-${request.toolCalls.length}`,
			name: event.toolName,
			args,
		});
		this.append(`→ ${event.toolName} ${JSON.stringify(args)}`);
	}

	private finishTool(event: RpcEvent): void {
		if (!event.toolName) return;
		const entry = this.entries
			.toReversed()
			.find(
				(item) =>
					item.kind === "tool" &&
					(event.toolCallId
						? item.id === event.toolCallId
						: item.name === event.toolName),
			);
		if (entry?.kind === "tool") {
			entry.result = event.result;
			entry.isError = event.isError;
		}
		this.append(`${event.isError ? "✗" : "✓"} ${event.toolName}`);
	}

	private changed(): void {
		this.listeners.forEach((listener) => listener());
		this.onChange();
	}
}
