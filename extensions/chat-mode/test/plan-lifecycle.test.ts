import assert from "node:assert/strict";
import test from "node:test";
import {
	enterPlanFromTool,
	enterPlanFromUser,
	getPlanLifecycleSnapshot,
	leavePlan,
	resetPlanLifecycle,
	resetPlanRemindersAfterCompaction,
	restorePlanLifecycle,
	takePlanReminder,
} from "../plan-lifecycle.ts";

test.beforeEach(() => {
	resetPlanLifecycle();
});

test("user entry waits for a full reminder; tool entry is immediately active", () => {
	enterPlanFromUser();
	assert.equal(getPlanLifecycleSnapshot().state, "pending");
	assert.equal(takePlanReminder(true), "full");
	assert.equal(getPlanLifecycleSnapshot().state, "active");
	assert.equal(takePlanReminder(true), "sparse");
	assert.equal(takePlanReminder(true), "full");

	resetPlanLifecycle();
	enterPlanFromTool();
	assert.equal(getPlanLifecycleSnapshot().state, "active");
	assert.equal(takePlanReminder(true), "full");
	assert.equal(takePlanReminder(true), "sparse");
});

test("leaving plan without a tool result emits an exit reminder once", () => {
	enterPlanFromTool();
	leavePlan(false);
	assert.equal(takePlanReminder(false), "exit");
	assert.equal(takePlanReminder(false), undefined);

	enterPlanFromUser();
	leavePlan(true);
	assert.equal(takePlanReminder(false), undefined);
});

test("reentry after a previous plan uses the reentry reminder", () => {
	enterPlanFromTool();
	leavePlan(true);
	enterPlanFromUser();
	assert.equal(takePlanReminder(true), "reentry");
});

test("restore, compaction, and legacy inactive-in-plan snapshots", () => {
	restorePlanLifecycle({
		state: "active",
		wasPreviouslyActive: true,
		reminderCount: 4,
		pendingExitReminder: false,
	});
	resetPlanRemindersAfterCompaction();
	assert.equal(takePlanReminder(true), "full");

	restorePlanLifecycle(undefined);
	assert.equal(getPlanLifecycleSnapshot().state, "inactive");
	assert.equal(takePlanReminder(true), "full");
	assert.equal(getPlanLifecycleSnapshot().state, "active");
});
