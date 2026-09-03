import { truncateSubagentOutput } from "../../shared/subagent/output-limit.js";
import type { SubagentRunResult } from "../../shared/subagent/run.js";
import { describeOutputs } from "./brief.js";
import { describeWorktree } from "./isolation.js";

const TRUNCATED_NOTICE =
	"[子 Agent 输出已截断；完整输出保存在工具 details 中。]";

/**
 * Text returned to the parent for a finished run: the capped report, the full
 * report path when truncated, declared output files, and the reusable handle.
 */
export function describeRunResult(result: SubagentRunResult): string {
	const visible = truncateSubagentOutput(result.output, TRUNCATED_NOTICE);
	const parts = [visible.content];
	if (visible.truncated && result.artifacts?.reportFile)
		parts.push(`\n\nFull report: ${result.artifacts.reportFile}`);
	parts.push(describeOutputs(result.artifacts?.outputs ?? []));
	if (result.artifacts?.worktree) parts.push(describeWorktree(result.artifacts.worktree));
	if (result.reusable && result.subagentId)
		parts.push(`\n\nReusable subagentId: ${result.subagentId} (turn ${result.turn}).`);
	return parts.join("");
}
