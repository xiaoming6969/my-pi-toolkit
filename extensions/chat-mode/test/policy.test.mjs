import assert from "node:assert/strict";
import test from "node:test";
import {
	checkAskBashCommand,
	isAskBashTool,
} from "../ask-bash-policy.ts";
import { ENTER_PLAN_TOOL, EXIT_PLAN_TOOL } from "../plan-file.ts";
import {
	checkAskToolCall,
	checkPlanToolCall,
	restrictedModeToolNames,
} from "../policy.ts";

test("Only Ask treats bash as an approved restricted-mode tool", () => {
	assert.equal(isAskBashTool("bash", "ask"), true);
	assert.equal(isAskBashTool("bash", "plan"), false);
	assert.equal(isAskBashTool("read", "ask"), false);
});

test("Ask allows approved read-only query commands", () => {
	for (const command of [
		"curl -fsSL https://github.com/apmantza/pi-lens/releases/tag/v4.1.0",
		"defuddle parse https://example.com/article --md",
		"defuddle parse https://example.com/article -p title",
		"git status --short",
		"git diff --stat",
		"git log --oneline -5",
		"git show HEAD:package.json",
		"git branch",
		"git branch --show-current",
		"git branch --list -a -r -v -vv",
		"git remote -v",
		"git remote",
		"git branch --contains=main",
		"defuddle parse https://example.com/article -p description",
		"defuddle parse https://example.com/article -p domain",
		"npm view pi-lens",
		"npm info pi-lens",
		"pnpm info pi-lens",
		"git log",
		"curl --fail-with-body --silent --show-error --location --head --compressed --max-time 5 --connect-timeout 1 --retry 2 https://example.com",
		"defuddle parse https://example.com/article",
		"gh issue list",
		"gh pr view 1",
		"gh repo list",
		"npm search pi-lens",
		"pnpm view pi-lens version",
	]) {
		assert.equal(checkAskBashCommand(command), undefined, command);
	}
});

test("Ask rejects shell composition and mutating or unknown commands", () => {
	for (const command of [
		"rm -rf src",
		"echo changed > file.txt",
		"curl https://example.com | jq .",
		"curl -o release.html https://example.com",
		"curl -X POST https://example.com",
		"curl -d payload https://example.com",
		"defuddle parse https://example.com --md -o page.md",
		"git diff --output=diff.txt",
		"git diff --ext-diff",
		"git branch feature",
		"gh release view v4.1.0 --web",
		"npm install pi-lens",
		"node -e process.exit()",
		"curl --max-time https://example.com",
		"curl --max-time",
		"curl -fsSL not-a-url",
		"curl https://example.com https://other.example",
		"defuddle parse",
		"defuddle parse https://example.com -p body",
		"git -c foo.bar=1 status",
		"git branch -O",
		"git remote origin",
		"gh issue view 1 --web",
		"gh issue",
		"gh",
		"pnpm",
		"git diff --textconv",
		"git show --config=user.name=x",
		"",
		"   ",
	]) {
		assert.ok(checkAskBashCommand(command), command);
	}
	assert.ok(checkAskBashCommand(undefined));
});

test("restrictedModeToolNames keeps read, path-gated, and plan tools", () => {
	const names = restrictedModeToolNames(["bash", "read", "edit", "write"], "ask");
	assert.ok(names.includes("bash"));
	assert.ok(names.includes("read"));
	assert.ok(names.includes("edit"));
	assert.ok(names.includes(ENTER_PLAN_TOOL));
	assert.ok(names.includes(EXIT_PLAN_TOOL));
	assert.ok(
		restrictedModeToolNames(["subagent", "read"], "ask").includes("subagent"),
	);
	assert.deepEqual(
		restrictedModeToolNames(["bash", "read"], "plan").includes("bash"),
		false,
	);
});

test("Ask and Plan path gates reject writes outside their allowed files", async () => {
	assert.match(
		await checkAskToolCall({ toolName: "bash", input: { command: "rm -rf src" } }, process.cwd()),
		/Ask mode/,
	);
	assert.match(
		await checkAskToolCall({ toolName: "write", input: { path: "src/a.ts" } }, process.cwd()),
		/\.pi directory/,
	);
	assert.match(
		await checkPlanToolCall({ toolName: "bash", input: {} }, process.cwd(), "plan.md"),
		/not allowed in plan mode/,
	);
	assert.match(
		await checkPlanToolCall({ toolName: "write", input: { path: "src/a.ts" } }, process.cwd(), "plan.md"),
		/only editable file/,
	);
	assert.match(
		await checkAskToolCall({ toolName: "write", input: {} }, process.cwd()),
		/no target path/,
	);
	assert.match(
		await checkAskToolCall({ toolName: "computer", input: {} }, process.cwd()),
		/not an approved/,
	);
	assert.equal(
		await checkAskToolCall({ toolName: "read", input: {} }, process.cwd()),
		undefined,
	);
	assert.match(
		await checkPlanToolCall({ toolName: "write", input: {} }, process.cwd(), "plan.md"),
		/requires a target path/,
	);
	assert.match(
		await checkPlanToolCall({ toolName: "write", input: { path: "src/a.ts" } }, process.cwd(), undefined),
		/unavailable/,
	);
});
