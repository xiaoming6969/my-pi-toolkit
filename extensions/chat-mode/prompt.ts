import { EXIT_PLAN_TOOL } from "./plan-file.js";
import type { PlanReminderKind } from "./plan-lifecycle.js";

export const PLAN_MODE_REMINDER_CUSTOM_TYPE = "plan-mode-reminder";
export const PLAN_EXIT_REMINDER_CUSTOM_TYPE = "plan-mode-exit-reminder";
export const IMPLEMENTATION_KICKOFF = [
	"The user approved the Plan.",
	"You are now in Build mode. Begin implementing the approved Plan immediately.",
	"Use the available Build tools to make the first concrete change; do not only describe the implementation or ask for another approval.",
].join("\n");

export const BUILD_MODE_PROMPT = `[BUILD MODE]

You are currently in Build mode with full tool and project-write access.
Follow the user's current implementation request. Earlier Ask or Plan mode messages are historical and must not be used to refuse work in this turn.`;

export const ASK_MODE_PROMPT = `[ASK MODE]

You are in question-and-answer mode.

- Answer, explain, inspect, diagnose, and research.
- Do not modify project files outside the project-local .pi directory.
- Bash is limited to approved read-only query commands. Do not use shell operators, redirection, expansion, output files, uploads, or mutating command options.
- Do not attempt to bypass these restrictions through shell commands or other tools.
- If the user requests implementation or another restricted action, tell them to press Shift+Tab to switch to Build mode.
- If the approach is ambiguous and a plan would help, call enter_plan_mode (user must approve).`;

export function debugModePrompt(endpoint: string, logPath: string): string {
	return `[DEBUG MODE]

Use runtime evidence to find the root cause before committing to a fix.

Collector endpoint: ${endpoint}
Session log: ${logPath}

Workflow:
1. Capture the expected behavior, actual behavior, error details, and exact reproduction conditions.
2. Inspect the relevant flow end to end and state concrete, falsifiable hypotheses.
3. Add only temporary, discriminating instrumentation. POST compact JSON records to the collector with hypothesis, location, and relevant values. Never log secrets, credentials, the collector token, or large objects.
4. Before stopping, POST a record shaped as {"type":"reproduction_steps","steps":["第一步的完整操作","第二步的完整操作"]}. Every step MUST be written in concise Chinese, contain one complete action, and must not use ellipses or omit commands, paths, inputs, or expected observations. Then ask the user to reproduce while the Debug Logs panel is open. Do not guess a fix before runtime evidence unless the root cause is already conclusive.
5. After the user selects 已复现, read ${logPath}, compare the evidence against each hypothesis, and make the smallest root-cause fix. If evidence is insufficient, refine the instrumentation and repeat.
6. Verify the fix, then wait for the user to select 已解决. Only then remove every temporary debug statement/helper, run the smallest relevant check, and call finish_debug_cleanup.

For browser instrumentation, POST JSON to the endpoint with fetch(). If CSP, a container, or a remote runtime cannot reach host localhost, append JSONL directly to the session log from a backend process or ask the user to provide native logs. Do not build a proxy.`;
}

export function debugReproducedMessage(logPath: string): string {
	return `The user selected 已复现 in Debug mode. Read ${logPath} now. Re-evaluate the stated hypotheses against the runtime evidence, identify the root cause, make the smallest targeted change, and verify it. If the evidence is insufficient, refine the temporary instrumentation and ask the user to reproduce again.`;
}

export const DEBUG_RESOLVED_MESSAGE =
	"The user selected 已解决 in Debug mode. Remove every temporary debug statement, endpoint reference, and helper added during this debugging session. Run the smallest relevant verification, then call finish_debug_cleanup to clear the session log and return to Build mode.";

export function planFileStructure(planPath: string): string {
	return `Prefer this structure in ${planPath}:

## Context
Why the change is needed.

## Approach
The recommended approach (not every alternative).

## Critical files
Paths that must change, plus existing helpers to reuse.

## Verification
How to test the change end to end.`;
}

/** Reminder text adapted from Grok Build's PlanModeTracker templates. */
export function planReminderText(
	kind: PlanReminderKind,
	planPath: string,
	planHasContent: boolean,
): string {
	if (kind === "exit") {
		return "You have exited plan mode. You can now make edits, run tools, and take actions.";
	}
	if (kind === "sparse") {
		return "Plan mode is still active. Do not make any edits or writes to the system except for the active plan file.";
	}
	if (kind === "reentry") {
		return [
			"## Returning to Plan Mode",
			"",
			`You are returning to the active draft at ${planPath}. Continue this plan rather than creating or editing another plan file.`,
			"",
			"Before writing unresolved material decisions into the Plan, use ask_user_choice to confirm them with concrete options and a recommended choice.",
			`Your turn should only end with either clarifying questions for the user or ${EXIT_PLAN_TOOL} to present your plan to the user.`,
		].join("\n");
	}

	const planFileBlock = planHasContent
		? `A plan file exists at ${planPath}. You can read it and make edits using the edit tool.`
		: `No plan written yet. Write your plan to ${planPath} using the write or edit tool.`;

	return [
		"Plan mode is active. Do not make any edits or writes to the system.",
		"",
		"## Plan File:",
		planFileBlock,
		"",
		"Build your plan by writing to or editing this file. It is the only file you are allowed to edit.",
		"Before writing unresolved material decisions into the Plan, use ask_user_choice to confirm them with 2-5 concrete options, key trade-offs, and at most one recommended choice. Skip questions already answered by repository evidence.",
		"If the user cancels a clarification, stop planning instead of inferring an answer or presenting the Plan for approval.",
		"",
		planFileStructure(planPath),
		"",
		`Your turn should only end with either clarifying questions for the user or ${EXIT_PLAN_TOOL} to present your plan to the user.`,
	].join("\n");
}
