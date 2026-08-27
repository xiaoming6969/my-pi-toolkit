import assert from "node:assert/strict";
import test from "node:test";
import { createModeController, toggleMode } from "../mode-controller.ts";
import { getChatMode, setChatMode } from "../state.ts";
import { resetPlanLifecycle } from "../plan-lifecycle.ts";
import {
	createFakeContext,
	createFakePi,
} from "../../shared/test/fake-extension.ts";

test("createModeController switches ask/plan tools and restores build", () => {
	resetPlanLifecycle();
	setChatMode("build");
	const { pi, activeTools } = createFakePi();
	const persisted: string[] = [];
	const controller = createModeController(
		pi,
		() => "/tmp/plan.md",
		() => persisted.push("ok"),
	);
	const ctx = createFakeContext();
	controller.switchMode("ask", ctx);
	assert.equal(getChatMode(), "ask");
	assert.ok(activeTools.includes("read"));
	assert.ok(activeTools.includes("enter_plan_mode"));
	assert.ok(ctx.notifies.some((item) => /ASK/.test(item.message)));
	controller.switchMode("debug", ctx);
	assert.ok(ctx.notifies.some((item) => /DEBUG/.test(item.message)));
	controller.switchMode("plan", ctx, { entrySource: "tool" });
	assert.equal(getChatMode(), "plan");
	controller.switchMode("build", ctx, { viaToolApproval: true });
	assert.equal(getChatMode(), "build");
	assert.ok(activeTools.includes("write"));
	assert.ok(persisted.length >= 3);

	controller.restoreRestricted("ask", ["read", "bash", "write"]);
	assert.equal(getChatMode(), "ask");
	controller.restoreRestricted("debug", ["read", "write"]);
	assert.equal(getChatMode(), "debug");
	const noPlan = createModeController(pi, () => undefined, () => {});
	noPlan.switchMode("plan", ctx);
	assert.match(ctx.notifies.at(-1)?.message ?? "", /活动 Plan/);
	controller.restoreFull("debug", ["read", "write"]);
	assert.equal(getChatMode(), "debug");
	controller.reset();
	assert.equal(getChatMode(), "build");
	setChatMode("build");
});

test("toggleMode waits for idle and enters plan on the next slot", async () => {
	resetPlanLifecycle();
	setChatMode("build");
	const { pi } = createFakePi();
	const controller = createModeController(pi, () => undefined, () => {});
	const busy = createFakeContext({ isIdle: false });
	toggleMode(controller, busy, async () => undefined);
	assert.match(busy.notifies[0]?.message ?? "", /请等待/);

	let entered = 0;
	toggleMode(controller, createFakeContext(), async () => {
		entered += 1;
	});
	assert.equal(entered, 1);

	setChatMode("plan");
	toggleMode(controller, createFakeContext(), async () => {
		throw new Error("should switch to ask");
	});
	assert.equal(getChatMode(), "ask");
	setChatMode("build");
});
