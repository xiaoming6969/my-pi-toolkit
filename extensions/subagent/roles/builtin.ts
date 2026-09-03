import { REPO_SEARCH_PI_LENS_TOOLS } from "../repo-search/pi-lens.js";
import { REPO_SEARCH_PROMPT } from "../repo-search/prompt.js";
import type { SubagentRoleDefinition } from "./types.js";

const PLAN_PROMPT = `You are the planning subagent. Explore the codebase read-only and produce a structured implementation plan for the delegated task.

Rules:
- You may inspect files with read, grep, find, and ls. Never modify files or run shell commands.
- Ground every step in inspected evidence; cite concise file paths and 1-based line numbers.
- Return a Markdown plan with: goal, current behavior, proposed changes (ordered steps with target files), risks and open questions, and how to verify.
- Keep the plan concrete enough that an implementer can follow it without re-discovering the codebase.
- Do not ask the parent agent to perform routine searches that you can complete yourself.`;

const IMPLEMENT_PROMPT = `You are an implementation subagent operating inside a larger coding task.

Rules:
- Complete only the delegated task; do not widen scope.
- Follow existing project conventions and AGENTS.md.
- Do not undo unrelated changes already present in the workspace.
- Re-read changed areas and run applicable checks after editing.
- Return a concise report with: outcome, changed files, verification performed, and blockers.`;

const REVIEW_PROMPT = `You are an independent code review subagent.

Rules:
- Review the delegated change set; you may read files and run read-only git commands such as git diff, git log and git show through bash.
- Never modify files, never run commands with side effects, and never claim changes were made.
- Judge correctness, regressions, security, missing tests, and over-engineering against the stated intent.
- Report findings ordered by severity (BLOCKED, HIGH, MEDIUM, LOW), each with file path, 1-based line number, the problem, and a concrete fix.
- End with an overall risk line: "Overall risk: LOW|MEDIUM|HIGH|BLOCKED".`;

export const BUILTIN_SUBAGENT_ROLES: readonly SubagentRoleDefinition[] = [
	{
		name: "explore",
		description:
			"Read-only repository reconnaissance: locate implementations, trace call flows, gather file and line evidence.",
		capability: "read-only",
		systemPrompt: REPO_SEARCH_PROMPT,
		resources: "lean",
		extraTools: [...REPO_SEARCH_PI_LENS_TOOLS],
		repoSearchGuard: true,
		contextFiles: false,
		source: "builtin",
	},
	{
		name: "plan",
		description:
			"Read-only planner: explores the codebase and returns a structured implementation plan without editing files.",
		capability: "read-only",
		systemPrompt: PLAN_PROMPT,
		resources: "lean",
		extraTools: [],
		repoSearchGuard: false,
		contextFiles: true,
		source: "builtin",
	},
	{
		name: "implement",
		description:
			"Implementer with the parent's tools, skills and extensions; edits files and runs checks for one delegated task.",
		capability: "all",
		systemPrompt: IMPLEMENT_PROMPT,
		resources: "inherit",
		extraTools: [],
		repoSearchGuard: false,
		contextFiles: true,
		source: "builtin",
	},
	{
		name: "review",
		description:
			"Independent reviewer: reads files and read-only git history via bash, returns severity-ranked findings.",
		capability: "execute",
		systemPrompt: REVIEW_PROMPT,
		resources: "lean",
		extraTools: [],
		repoSearchGuard: false,
		contextFiles: true,
		source: "builtin",
	},
];
