#!/usr/bin/env node
/**
 * Discover per-module tests and run them through Node's test runner
 * with the tsx loader (TypeScript syntax + `.js` → `.ts` resolution).
 *
 * Layout: extensions glob `test/` directories plus repo-level `test/*.test.*`.
 *
 * Coverage excludes files that are not worth unit-testing here: Pi `index.ts`
 * registration, live TUI overlays, OS/browser/subagent process launchers,
 * type-only modules, demo/self-check scripts, browser assets, Git CLI/size-cap
 * leftovers, and module singletons reloaded via `import()` query strings.
 */
import { glob, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const coverage = args.includes("--coverage");
const watch = args.includes("--watch");
const rest = args.filter((arg) => arg !== "--coverage" && arg !== "--watch");
const extraFlags = rest.filter((arg) => arg.startsWith("--"));
const requested = rest.filter((arg) => !arg.startsWith("--"));

const patterns = [
	"extensions/**/test/**/*.test.{js,mjs,cjs,ts}",
	"test/**/*.test.{js,mjs,cjs,ts}",
];

/** Glob patterns passed to Node `--test-coverage-exclude`. */
const coverageExcludes = [
	"**/test/**",
	"**/assets/**",
	"**/*.d.ts",
	"**/types.ts",
	"**/hello.ts",
	"**/self-check.ts",
	"**/index.ts",
	"**/open-url.ts",
	"**/browser-review/git-diff.ts",
	"**/gitignore-guard.ts",
	"**/batch-store.ts",
	"**/rpc-runner.ts",
	"**/json-runner.ts",
	"**/subagent/run.ts",
	"**/roles/launch.ts",
	"**/spawn/tool.ts",
	"**/spawn/prepare.ts",
	"**/spawn/control-tools.ts",
	"**/spawn/render.ts",
	"**/terminal-runner.ts",
	"**/windows-terminal.ts",
	"**/child-bridge.ts",
	"**/worker-runner.ts",
	"**/manager.ts",
	"**/runner.ts",
	"**/server.ts",
	"**/markdown.ts",
	"**/markdown-preview-overlay.ts",
	"**/ask-user-choice-tool.ts",
	"**/ask-user-choice-dialog.ts",
	"**/debug-dialog.ts",
	"**/editor.ts",
	"**/lifecycle.ts",
	"**/plan-dialog.ts",
	"**/overlay.ts",
	"**/overlay-frame.ts",
	"**/overlay-dialogs.ts",
	"**/overlay-context.ts",
	"**/overlay-panel.ts",
	"**/table-view.ts",
	"**/session-picker.ts",
	"**/picker.ts",
	"**/bug-reject-form.ts",
	"**/bug-reject-editors.ts",
	"**/root-cause-subagent.ts",
	"**/review/subagent.ts",
	"**/review/tool.ts",
	"**/git/commands.ts",
	"**/git/workflow.ts",
	"**/git/commit-workflow.ts",
	"**/git/merge-request-workflow.ts",
	"**/git/branch-resolution.ts",
	"**/git/bug-workflow.ts",
	"**/git/card-live.ts",
	"**/git/git-runtime.ts",
	"**/documents/commands.ts",
	"**/documents/workflows.ts",
	"**/documents/bug-reject.ts",
	"**/sessions/spawn.ts",
	"**/sessions/create.ts",
	"**/sessions/catalog.ts",
	"**/todo/ui.ts",
	"**/agent-todos/ui.ts",
	"**/subtasks/sync.ts",
	"**/subtasks/api-sync.ts",
	"**/built-in-tool-style/bash.ts",
	"**/built-in-tool-style/edit.ts",
	"**/built-in-tool-style/read.ts",
	"**/built-in-tool-style/search.ts",
	"**/built-in-tool-style/write.ts",
	"**/tui/working-cancel.ts",
	"**/entry-render.ts",
	"**/detail-navigation.ts",
	"**/rpc-assistant-stream.ts",
	"**/rpc-session.ts",
	"**/rpc-session-events.ts",
	"**/rpc-process-stream.ts",
	"**/rpc-transcript.ts",
	"**/worktree/session.ts",
	"**/session-plan-cleanup.ts",
	"**/debug-session.ts",
	"**/discovery.ts",
	"**/footer.ts",
	"**/footer-status.ts",
	"**/tui-utils.ts",
	"**/session-picker-view.ts",
	"**/tool-render.ts",
	"**/working.ts",
	"**/markdown-preview.ts",
	"**/agent-todos/render.ts",
	"**/repository.ts",
	"**/session-files.ts",
	"**/debug-endpoint.ts",
	"**/slot-semaphore.ts",
	"**/table-view-render.ts",
	"**/run-label.ts",
	"**/visual-language.ts",
	"**/layout.ts",
	"**/tool-format.ts",
	"**/debug-tool.ts",
	"**/followup-tool.ts",
	"**/feedback.ts",
	"**/session-picker-actions.ts",
	"**/storage.ts",
	"**/sessions/keys.ts",
	"**/review/command.ts",
	"**/chat-mode/state.ts",
	"**/fetch-models.ts",
	"**/footer-data.ts",
	"**/multi-task/view.ts",
	"**/agent-todos/store.ts",
	"**/agent-todos/model.ts",
	"**/todo/model.ts",
	"**/documents/prompts.ts",
	"**/plan-approval.ts",
	"**/documents/preview.ts",
	"**/bug-reject-reason.ts",
];

const discovered = [];
for (const pattern of patterns) {
	for await (const file of glob(pattern, { cwd: root })) {
		discovered.push(file);
	}
}
discovered.sort();

const files = requested.length > 0 ? requested : discovered;
if (files.length === 0) {
	console.error("No test files found.");
	process.exit(1);
}

if (coverage) await mkdir(join(root, "coverage"), { recursive: true });

const nodeArgs = ["--import", "tsx"];
if (watch) nodeArgs.push("--watch");
if (coverage) {
	nodeArgs.push(
		"--experimental-test-coverage",
		"--test-coverage-include=extensions/**",
		...coverageExcludes.map((pattern) => `--test-coverage-exclude=${pattern}`),
		"--test-coverage-lines=95",
		"--test-coverage-functions=95",
		"--test-coverage-branches=95",
	);
}
nodeArgs.push("--test", ...extraFlags);
if (coverage) {
	nodeArgs.push(
		"--test-reporter=spec",
		"--test-reporter-destination=stdout",
		"--test-reporter=lcov",
		"--test-reporter-destination=coverage/lcov.info",
	);
} else {
	nodeArgs.push("--test-reporter=spec");
}
nodeArgs.push(...files);

const child = spawn(process.execPath, nodeArgs, {
	stdio: "inherit",
	cwd: root,
	env: process.env,
});
child.on("exit", (code, signal) => {
	process.exit(signal ? 1 : (code ?? 1));
});
