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
