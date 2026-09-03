import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { SUBAGENT_CHILD_ENV } from "./child-guard.js";
import { getPiInvocation } from "./pi-invocation.js";
import { prepareTaskArtifacts, SUBAGENT_RUNS_ROOT } from "./run-paths.js";
import { RpcSubagentSession } from "./rpc-session.js";
import {
	appendThinkingCliArgs,
	type TerminalSubagentOptions,
	type TerminalSubagentResult,
} from "./terminal-runner.js";

function buildArgs(options: TerminalSubagentOptions, runDir: string): string[] {
	const args = [
		"--mode",
		"rpc",
		"--session-dir",
		join(runDir, "sessions"),
		"--name",
		options.title,
	];
	if (options.forkSessionFile) args.push("--fork", options.forkSessionFile);
	if (!options.loadDefaultResources) args.push("--no-extensions");
	for (const extension of options.extensionPaths ?? [])
		args.push("--extension", extension);
	if (!options.loadDefaultResources)
		args.push("--no-skills", "--no-prompt-templates");
	if (options.disableContextFiles) args.push("--no-context-files");
	args.push(...(options.extraCliArgs ?? []));
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
	return args;
}

async function writeLaunchMetadata(
	runDir: string,
	id: string,
	options: TerminalSubagentOptions,
): Promise<void> {
	await writeFile(
		join(runDir, "launch.json"),
		JSON.stringify(
			{
				id,
				title: options.title,
				model: options.model,
				thinkingLevel: options.thinkingLevel,
				cwd: options.cwd,
				parentSessionId: options.parentSessionId,
				reusable: options.keepOpen !== false,
				mode: "manual-rpc",
				startedAt: new Date().toISOString(),
			},
			null,
			2,
		),
		{ encoding: "utf8", mode: 0o600 },
	);
}

export async function runRpcSubagent(
	options: TerminalSubagentOptions,
): Promise<TerminalSubagentResult> {
	await mkdir(SUBAGENT_RUNS_ROOT, { recursive: true, mode: 0o700 });
	const id = options.runId ?? randomUUID();
	const runDir = join(SUBAGENT_RUNS_ROOT, id);
	await mkdir(join(runDir, "sessions"), { recursive: true, mode: 0o700 });
	const task = await prepareTaskArtifacts(
		runDir,
		options.task,
		options.artifactFiles ?? [],
	);
	await writeLaunchMetadata(runDir, id, options);
	const invocation = getPiInvocation(buildArgs(options, runDir));
	// Arguments are passed as an array with shell disabled; no user text is executed by a shell.
	// nosemgrep: javascript.lang.security.detect-child-process.detect-child-process
	const child = spawn(invocation.command, invocation.args, {
		cwd: options.cwd,
		env: { ...process.env, ...options.env, [SUBAGENT_CHILD_ENV]: "1" },
		shell: false,
		stdio: ["pipe", "pipe", "pipe"],
	});
	return new RpcSubagentSession(child, id, runDir, options).start(task);
}
