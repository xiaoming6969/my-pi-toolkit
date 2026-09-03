import { spawn } from "node:child_process";
import { SUBAGENT_CHILD_ENV } from "./child-guard.js";
import { getPiInvocation, type PiInvocation } from "./pi-invocation.js";
import type { SubagentToolCall } from "./registry.js";
import { appendThinkingCliArgs } from "./terminal-runner.js";

export interface JsonSubagentOptions {
	cwd: string;
	title: string;
	model: string;
	thinkingLevel?: string;
	task: string;
	systemPrompt: string;
	tools: string;
	extensionPaths?: string[];
	loadDefaultResources?: boolean;
	disableContextFiles?: boolean;
	signal?: AbortSignal;
	onUpdate?: (update: { output: string; toolCalls: SubagentToolCall[] }) => void;
	/** How to launch the child for the built CLI args; defaults to the parent's Pi. */
	invocation?: (args: string[]) => PiInvocation;
}

export interface JsonSubagentResult {
	output: string;
	toolCalls: SubagentToolCall[];
	exitCode: number;
	stderr: string;
}

interface JsonMessage {
	role?: string;
	content?: Array<{
		type?: string;
		text?: string;
		name?: string;
		arguments?: unknown;
	}>;
}

function parseMessageEnd(line: string): JsonMessage | undefined {
	if (!line.trim()) return undefined;
	try {
		const event = JSON.parse(line) as { type?: string; message?: JsonMessage };
		return event.type === "message_end" ? event.message : undefined;
	} catch {
		return undefined;
	}
}

function messageToolCalls(message: JsonMessage): SubagentToolCall[] {
	if (message.role !== "assistant" || !Array.isArray(message.content))
		return [];
	return message.content.flatMap((part) => {
		if (part.type !== "toolCall" || typeof part.name !== "string") return [];
		const value = part.arguments;
		const args =
			value && typeof value === "object" && !Array.isArray(value)
				? (value as Record<string, unknown>)
				: {};
		return [{ name: part.name, arguments: args }];
	});
}

function finalAssistantText(messages: JsonMessage[]): string {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message.role !== "assistant" || !Array.isArray(message.content))
			continue;
		const text = message.content
			.flatMap((part) =>
				part.type === "text" && typeof part.text === "string"
					? [part.text]
					: [],
			)
			.join("\n");
		if (text) return text;
	}
	return "";
}

function buildArgs(options: JsonSubagentOptions): string[] {
	const args = ["--mode", "json", "-p", "--no-session"];
	if (!options.loadDefaultResources) args.push("--no-extensions");
	for (const extension of options.extensionPaths ?? [])
		args.push("--extension", extension);
	if (!options.loadDefaultResources)
		args.push("--no-skills", "--no-prompt-templates");
	if (options.disableContextFiles) args.push("--no-context-files");
	args.push(
		"--tools",
		options.tools,
		"--models",
		options.model,
		"--model",
		options.model,
		"--system-prompt",
		options.systemPrompt,
	);
	appendThinkingCliArgs(args, options.thinkingLevel);
	args.push(options.task);
	return args;
}

/**
 * One-shot `pi --mode json -p` child. Used when the configured presentation
 * does not provide a managed RPC session (inline, or a failed terminal launch).
 * The child is not registered in the live registry and cannot be resumed.
 */
export async function runJsonSubagent(
	options: JsonSubagentOptions,
): Promise<JsonSubagentResult> {
	const invocation = (options.invocation ?? getPiInvocation)(buildArgs(options));
	const messages: JsonMessage[] = [];
	const toolCalls: SubagentToolCall[] = [];
	let stderr = "";
	let buffer = "";
	let aborted = false;

	const exitCode = await new Promise<number>((resolveExit, reject) => {
		// Arguments are passed as an array with shell disabled; no user text is executed by a shell.
		// nosemgrep: javascript.lang.security.detect-child-process.detect-child-process
		const child = spawn(invocation.command, invocation.args, {
			cwd: options.cwd,
			env: { ...process.env, [SUBAGENT_CHILD_ENV]: "1" },
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		const stop = () => {
			if (aborted) return;
			aborted = true;
			child.kill("SIGTERM");
			killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
			killTimer.unref?.();
		};
		const cleanup = () => {
			if (killTimer) clearTimeout(killTimer);
			options.signal?.removeEventListener("abort", stop);
		};
		if (options.signal?.aborted) stop();
		else options.signal?.addEventListener("abort", stop, { once: true });
		const processLine = (line: string) => {
			const message = parseMessageEnd(line);
			if (!message) return;
			messages.push(message);
			toolCalls.push(...messageToolCalls(message));
			options.onUpdate?.({
				output: finalAssistantText(messages),
				toolCalls: [...toolCalls],
			});
		};
		child.stdout.on("data", (data) => {
			buffer += data.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) processLine(line);
		});
		child.stderr.on("data", (data) => {
			stderr += data.toString();
		});
		child.on("error", (error) => {
			cleanup();
			reject(error);
		});
		child.on("close", (code) => {
			cleanup();
			if (buffer.trim()) processLine(buffer);
			resolveExit(code ?? 1);
		});
	});

	if (aborted) throw new Error(`${options.title} 已取消`);
	const output = finalAssistantText(messages);
	if (exitCode !== 0 || !output)
		throw new Error(
			`${options.title} 运行失败（exit ${exitCode}，model ${options.model}）: ${stderr.trim() || "未返回结果"}`,
		);
	return { output, toolCalls, exitCode, stderr };
}
