import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { truncateSubagentOutput } from "../../shared/subagent/output-limit.js";
import { runSubagent } from "../../shared/subagent/run.js";
import {
	resolveRepoSearchExtensionPaths,
	REPO_SEARCH_PI_LENS_TOOLS,
} from "./pi-lens.js";
import { REPO_SEARCH_PROMPT } from "./prompt.js";
import type {
	RepoSearchDetails,
	RepoSearchRunConfig,
	RepoSearchRunResult,
} from "./types.js";

const EXTENSION_DIR = path.dirname(fileURLToPath(import.meta.url));
const GITIGNORE_GUARD_EXTENSION = path.resolve(
	EXTENSION_DIR,
	"gitignore-guard.ts",
);
const TRUNCATED_NOTICE =
	"[Repo Search 子 Agent 输出已截断；完整输出保存在工具 details 中。]";

function makeDetails(options: {
	task: string;
	config: RepoSearchRunConfig;
	output: string;
	toolCalls: RepoSearchDetails["toolCalls"];
	exitCode: number;
	stderr: string;
	truncated?: boolean;
	subagentId?: string;
	reusable?: boolean;
	turn?: number;
	runDir?: string;
}): RepoSearchDetails {
	return {
		task: options.task,
		model: options.config.model,
		thinkingLevel: options.config.thinkingLevel,
		modelSource: options.config.source,
		output: options.output,
		toolCalls: [...options.toolCalls],
		exitCode: options.exitCode,
		stderr: options.stderr,
		truncated: options.truncated ?? false,
		subagentId: options.subagentId,
		reusable: options.reusable ?? false,
		turn: options.turn,
		runDir: options.runDir,
	};
}

export async function runRepoSearchSubagent(options: {
	cwd: string;
	task: string;
	config: RepoSearchRunConfig;
	keepOpen?: boolean;
	parentSessionId?: string;
	signal?: AbortSignal;
	onUpdate?: (details: RepoSearchDetails) => void;
}): Promise<RepoSearchRunResult> {
	const optionalExtensions = await resolveRepoSearchExtensionPaths(
		options.cwd,
		options.config.projectTrusted ?? false,
		options.config.model,
	);
	const result = await runSubagent({
		cwd: options.cwd,
		title: "Repo Search Subagent",
		model: options.config.model,
		thinkingLevel: options.config.thinkingLevel,
		task: `Repository search task: ${options.task}`,
		systemPrompt: REPO_SEARCH_PROMPT,
		capability: "read-only",
		extraTools: REPO_SEARCH_PI_LENS_TOOLS,
		extensionPaths: [GITIGNORE_GUARD_EXTENSION, ...optionalExtensions],
		disableContextFiles: true,
		presentation: options.config.presentation,
		keepOpen: options.keepOpen,
		parentSessionId: options.parentSessionId,
		signal: options.signal,
		onUpdate: ({ toolCalls, subagentId, reusable, turn }) =>
			options.onUpdate?.(
				makeDetails({
					task: options.task,
					config: options.config,
					output: "",
					toolCalls,
					exitCode: -1,
					stderr: "",
					subagentId,
					reusable,
					turn,
				}),
			),
	});
	const visible = truncateSubagentOutput(result.output, TRUNCATED_NOTICE);
	return {
		content: result.reusable
			? `${visible.content}\n\nReusable subagentId: ${result.subagentId} (turn ${result.turn}).`
			: visible.content,
		details: makeDetails({
			task: options.task,
			config: options.config,
			output: result.output,
			toolCalls: result.toolCalls,
			exitCode: result.exitCode,
			stderr: result.stderr,
			truncated: visible.truncated,
			subagentId: result.subagentId,
			reusable: result.reusable,
			turn: result.turn,
			runDir: result.runDir,
		}),
	};
}
