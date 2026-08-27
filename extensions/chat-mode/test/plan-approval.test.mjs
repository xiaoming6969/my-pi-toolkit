import assert from "node:assert/strict";
import test from "node:test";
const approvalModule = await import("../plan-approval.ts");
const { requestPlanApproval, requestTerminalPlanApproval } =
	approvalModule.default ?? approvalModule;

function context(choice) {
	return {
		hasUI: true,
		mode: "rpc",
		ui: {
			notify() {},
			select: async () => choice,
			editor: async () => undefined,
		},
	};
}

test("disabled browser review uses the terminal approval choices", async () => {
	const result = await requestTerminalPlanApproval(
		context("批准但暂不实现"),
		"plan.md",
		"# Plan",
	);
	assert.deepEqual(result, { decision: "defer" });
});

test("browser review remains enabled by default", async () => {
	const reviews = {
		open: async () => ({ status: "approved", annotations: [] }),
	};
	const result = await requestPlanApproval(
		context(undefined),
		reviews,
		"plan.md",
		"# Plan",
	);
	assert.deepEqual(result, { decision: "implement", feedback: undefined });
});

test("terminal and browser approval cover each decision", async () => {
	assert.deepEqual(
		await requestTerminalPlanApproval(
			{ hasUI: false, ui: {} },
			"plan.md",
			"# Plan",
		),
		{ decision: "implement" },
	);
	assert.deepEqual(
		await requestPlanApproval(
			{ hasUI: false, ui: {} },
			{ open: async () => ({ status: "approved", annotations: [] }) },
			"plan.md",
			"# Plan",
		),
		{ decision: "implement" },
	);
	assert.deepEqual(
		await requestTerminalPlanApproval(context("批准并实现"), "plan.md", "# Plan"),
		{ decision: "implement" },
	);
	assert.deepEqual(
		await requestTerminalPlanApproval(context("取消计划"), "plan.md", "# Plan"),
		{ decision: "abandon" },
	);
	assert.deepEqual(
		await requestTerminalPlanApproval(context("继续编辑"), "plan.md", "# Plan"),
		{ decision: "revise", feedback: undefined },
	);
	const withNote = context("继续编辑");
	withNote.ui.editor = async () => "  改步骤  ";
	assert.deepEqual(
		await requestTerminalPlanApproval(withNote, "plan.md", "# Plan"),
		{ decision: "revise", feedback: "改步骤" },
	);

	const statuses = [
		["deferred", { decision: "defer" }],
		["abandoned", { decision: "abandon" }],
		["feedback", { decision: "revise", feedback: "nits" }],
		["closed", { decision: "closed" }],
	];
	for (const [status, expected] of statuses) {
		const result = await requestPlanApproval(
			context("批准并实现"),
			{
				open: async () => ({
					status,
					annotations: [],
					feedback: status === "feedback" ? "nits" : undefined,
				}),
			},
			"plan.md",
			"# Plan",
		);
		assert.deepEqual(result, expected);
	}

	const annotated = await requestPlanApproval(
		context("批准并实现"),
		{
			open: async () => ({
				status: "approved",
				annotations: [
					{
						startLine: 1,
						endLine: 1,
						comment: "ok",
						quote: "line",
					},
				],
			}),
		},
		"plan.md",
		"# Plan",
	);
	assert.equal(annotated.decision, "implement");
	assert.match(annotated.feedback ?? "", /ok/);

	const fallback = await requestPlanApproval(
		context("批准但暂不实现"),
		{
			open: async () => ({
				status: "unavailable",
				error: "offline",
				annotations: [],
			}),
		},
		"plan.md",
		"# Plan",
	);
	assert.deepEqual(fallback, { decision: "defer" });
});
