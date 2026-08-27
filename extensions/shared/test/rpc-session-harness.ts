import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { getLiveSubagent } from "../subagent/registry.ts";
import { RpcSubagentSession } from "../subagent/rpc-session.ts";

export class FakeChild extends EventEmitter {
	readonly stdin = new PassThrough();
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	readonly pid = 1234;
	closed = false;

	kill(): boolean {
		return true;
	}

	close(code: number): void {
		if (this.closed) return;
		this.closed = true;
		this.emit("close", code);
	}
}

export async function harness(
	id: string,
	options: { keepOpen?: boolean; abortSettleTimeoutMs?: number } = {},
) {
	const dir = await mkdtemp(join(tmpdir(), "rpc-subagent-test-"));
	await mkdir(join(dir, "sessions"));
	const child = new FakeChild();
	const prompts: string[] = [];
	let abortCount = 0;
	let buffer = "";
	child.stdin.on("data", (chunk) => {
		buffer += chunk.toString();
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			if (!line) continue;
			const command = JSON.parse(line) as { type?: string; message?: string };
			if (command.type === "prompt" && command.message)
				prompts.push(command.message);
			if (command.type === "abort") abortCount++;
		}
	});
	const session = new RpcSubagentSession(
		child as unknown as ChildProcessWithoutNullStreams,
		id,
		dir,
		{
			cwd: process.cwd(),
			title: "test",
			model: "test/model",
			task: "unused",
			systemPrompt: "test",
			tools: "read",
			keepOpen: options.keepOpen ?? true,
			abortSettleTimeoutMs: options.abortSettleTimeoutMs,
			parentSessionId: "parent",
		},
	);
	const emit = (event: Record<string, unknown>) =>
		child.stdout.write(`${JSON.stringify(event)}\n`);
	return {
		child,
		prompts,
		get abortCount() {
			return abortCount;
		},
		start: (task: string) => session.start(task),
		emitEvent: emit,
		settle(text: string, withTool = false) {
			emit({ type: "agent_start" });
			if (withTool) {
				emit({
					type: "tool_execution_start",
					toolCallId: "call-1",
					toolName: "read",
					args: { path: "a.ts" },
				});
				emit({
					type: "tool_execution_end",
					toolCallId: "call-1",
					toolName: "read",
					result: {},
					isError: false,
				});
			}
			emit({
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text }],
				},
			});
			emit({ type: "agent_settled" });
		},
		async cleanup() {
			getLiveSubagent(id)?.dispose();
			child.close(0);
			await rm(dir, { recursive: true, force: true });
		},
	};
}

export const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
export const delay = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));
