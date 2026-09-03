import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SubagentRoleOutput } from "../roles/types.js";

export interface SubagentBriefInput {
	prompt: string;
	relevantFiles?: string[];
	constraints?: string[];
	expectedOutput?: string;
	/** Declared role outputs and the directory the child must write them to. */
	outputs?: SubagentRoleOutput[];
	outputsDir?: string;
	/** Set when the child continues a prior transcript via resume. */
	resumedFrom?: string;
	/** Set when the child works in an isolated git worktree. */
	worktree?: { path: string; branch: string };
}

function cleanList(values: string[] | undefined): string[] {
	return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

/**
 * Render the structured brief into the child's first user message. Sections
 * are only emitted when present so a plain prompt stays a plain prompt.
 */
export function buildSubagentBrief(input: SubagentBriefInput): string {
	const sections = [input.prompt.trim()];
	const files = cleanList(input.relevantFiles);
	if (files.length > 0)
		sections.push(["Relevant files:", ...files.map((file) => `- ${file}`)].join("\n"));
	const constraints = cleanList(input.constraints);
	if (constraints.length > 0)
		sections.push(
			["Constraints:", ...constraints.map((item) => `- ${item}`)].join("\n"),
		);
	const expected = input.expectedOutput?.trim();
	if (expected) sections.push(`Expected output:\n${expected}`);
	if (input.outputs && input.outputs.length > 0 && input.outputsDir)
		sections.push(
			[
				"Output files (write each to the exact path; the parent reads them after you finish):",
				...input.outputs.map(
					(output) =>
						`- ${join(input.outputsDir!, output.name)}${output.required ? " (required)" : ""}${output.description ? `: ${output.description}` : ""}`,
				),
			].join("\n"),
		);
	if (input.resumedFrom)
		sections.push(
			`This conversation continues the transcript of subagent ${input.resumedFrom}; build on its findings instead of re-discovering them.`,
		);
	if (input.worktree)
		sections.push(
			`You are working in an isolated git worktree at ${input.worktree.path} on branch ${input.worktree.branch}. Edit files there only; do not switch branches or touch other worktrees. Leave your changes in the working tree (committing is optional) so the parent can review and merge them.`,
		);
	return sections.join("\n\n");
}

export interface CollectedOutput {
	name: string;
	path: string;
	exists: boolean;
	required: boolean;
}

export function collectDeclaredOutputs(
	outputs: SubagentRoleOutput[],
	outputsDir: string,
): CollectedOutput[] {
	return outputs.map((output) => {
		const path = join(outputsDir, output.name);
		return { name: output.name, path, exists: existsSync(path), required: output.required };
	});
}

export function describeOutputs(outputs: CollectedOutput[]): string {
	if (outputs.length === 0) return "";
	const lines = outputs.map((output) =>
		output.exists
			? `- ${output.name}: ${output.path}`
			: `- ${output.name}: missing${output.required ? " (required)" : ""}`,
	);
	return `\n\nOutput files:\n${lines.join("\n")}`;
}
