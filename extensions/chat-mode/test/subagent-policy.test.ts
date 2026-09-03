import assert from "node:assert/strict";
import test from "node:test";
import {
	registerLiveSubagent,
	removeLiveSubagent,
	type LiveSubagentRun,
} from "../../shared/subagent/registry.ts";
import {
	checkAskToolCall,
	checkPlanToolCall,
	restrictedModeToolNames,
} from "../policy.ts";
import {
	checkReadOnlySubagentCall,
	type SubagentPolicyDeps,
} from "../subagent-policy.ts";

const deps: SubagentPolicyDeps = {
	roleCapability: (role) => {
		if (role === "explore" || role === "plan") return "read-only";
		if (role === "review") return "execute";
		if (role === "implement") return "all";
		throw new Error(`未知的子 Agent 角色 "${role}"`);
	},
	liveCapability: (id) =>
		id === "ro" ? "read-only" : id === "rw" ? "all" : id === "legacy" ? undefined : null,
};

test("spawn_subagent is allowed only for read-only roles", () => {
	const call = (role?: string) =>
		checkReadOnlySubagentCall(
			{ toolName: "spawn_subagent", input: role ? { role } : {} },
			"/repo",
			true,
			"Ask",
			deps,
		);
	assert.equal(call(), undefined);
	assert.equal(call("plan"), undefined);
	assert.match(call("review") ?? "", /only allows read-only subagent roles; "review" is execute/);
	assert.match(call("implement") ?? "", /Ask mode/);
	assert.match(call("ghost") ?? "", /未知的子 Agent 角色/);
});

test("subagent_followup is allowed only towards read-only live children", () => {
	const call = (subagentId: string) =>
		checkReadOnlySubagentCall(
			{ toolName: "subagent_followup", input: { subagentId } },
			"/repo",
			false,
			"Plan",
			deps,
		);
	assert.equal(call("ro"), undefined);
	assert.match(call("rw") ?? "", /Plan mode only allows follow-ups to read-only subagents/);
	assert.match(call("legacy") ?? "", /read-only subagents/);
	assert.equal(call("missing"), undefined);
	assert.equal(
		checkReadOnlySubagentCall({ toolName: "read", input: {} }, "/repo", false, "Ask", deps),
		undefined,
	);
});

test("policy wires subagent tools into Ask and Plan checks", async () => {
	const names = restrictedModeToolNames(
		["spawn_subagent", "subagent_followup", "subagent_wait", "subagent_output", "subagent_cancel", "bash"],
		"plan",
	);
	for (const name of ["spawn_subagent", "subagent_followup", "subagent_wait", "subagent_output", "subagent_cancel"])
		assert.ok(names.includes(name), name);
	assert.equal(names.includes("bash"), false);

	assert.equal(
		await checkAskToolCall({ toolName: "subagent_wait", input: {} }, process.cwd()),
		undefined,
	);
	assert.equal(
		await checkAskToolCall(
			{ toolName: "spawn_subagent", input: { role: "explore" } },
			process.cwd(),
		),
		undefined,
	);
	assert.match(
		(await checkAskToolCall(
			{ toolName: "spawn_subagent", input: { role: "implement" } },
			process.cwd(),
		)) ?? "",
		/Ask mode only allows read-only subagent roles/,
	);
	assert.match(
		(await checkPlanToolCall(
			{ toolName: "spawn_subagent", input: { role: "review" } },
			process.cwd(),
			"plan.md",
		)) ?? "",
		/Plan mode only allows read-only subagent roles/,
	);

	const run: LiveSubagentRun = {
		id: `policy-${process.pid}`,
		title: "t",
		model: "m",
		capability: "all",
		cwd: process.cwd(),
		status: "completed",
		startedAt: "2026-01-01T00:00:00.000Z",
		parentSessionId: "s",
		reusable: true,
		turnCount: 1,
		lines: [],
		entries: [],
		request: async () => {
			throw new Error("unused");
		},
		abort() {},
		dispose() {},
		subscribe: () => () => {},
	};
	registerLiveSubagent(run);
	try {
		assert.match(
			(await checkPlanToolCall(
				{ toolName: "subagent_followup", input: { subagentId: run.id } },
				process.cwd(),
				"plan.md",
			)) ?? "",
			/follow-ups to read-only subagents/,
		);
		run.capability = "read-only";
		assert.equal(
			await checkAskToolCall(
				{ toolName: "subagent_followup", input: { subagentId: run.id } },
				process.cwd(),
			),
			undefined,
		);
	} finally {
		removeLiveSubagent(run.id);
	}
});
