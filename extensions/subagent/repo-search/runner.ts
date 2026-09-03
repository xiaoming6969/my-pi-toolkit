import { truncateSubagentOutput } from "../../shared/subagent/output-limit.js";
import { BUILTIN_SUBAGENT_ROLES } from "../roles/builtin.js";
import { runRoleSubagent } from "../roles/launch.js";
import type {
	RepoSearchDetails,
	RepoSearchRunConfig,
	RepoSearchRunResult,
} from "./types.js";

const EXPLORE_ROLE = BUILTIN_SUBAGENT_ROLES.find((role) => role.name === "explore")!;
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

/** `repo_search` is the built-in `explore` role with the Repo Search model config. */
export async function runRepoSearchSubagent(options: {
	cwd: string;
	task: string;
	config: RepoSearchRunConfig;
	keepOpen?: boolean;
	parentSessionId?: string;
	signal?: AbortSignal;
	onUpdate?: (details: RepoSearchDetails) => void;
}): Promise<RepoSearchRunResult> {
	const result = await runRoleSubagent({
		role: EXPLORE_ROLE,
		cwd: options.cwd,
		title: "Repo Search Subagent",
		model: options.config.model,
		thinkingLevel: options.config.thinkingLevel,
		task: `Repository search task: ${options.task}`,
		projectTrusted: options.config.projectTrusted ?? false,
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
