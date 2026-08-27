import assert from "node:assert/strict";
import test from "node:test";
import { requestTapdReview } from "../review/command.ts";
import { buildReviewTask } from "../review/prompt.ts";
import { createFakeContext, createFakePi } from "../../shared/test/fake-extension.ts";

test("requestTapdReview requires an idle agent and valid --base", async () => {
	const { pi, messages } = createFakePi();
	const busy = createFakeContext({ isIdle: false });
	await requestTapdReview(pi, busy, []);
	assert.match(busy.notifies[0]?.message ?? "", /请稍后再运行/);

	const ctx = createFakeContext({ hasUI: false });
	await requestTapdReview(pi, ctx, ["--base"]);
	assert.match(ctx.notifies[0]?.message ?? "", /--base 需要指定/);

	await requestTapdReview(pi, ctx, ["--base", "origin/main", "注意边界"]);
	assert.equal(messages.length, 1);
	assert.match(JSON.stringify(messages[0]), /origin\/main/);
	assert.match(JSON.stringify(messages[0]), /注意边界/);
});

test("requestTapdReview uses the first UI scope choice", async () => {
	const { pi, messages } = createFakePi();
	const ctx = createFakeContext({ hasUI: true });
	await requestTapdReview(pi, ctx, []);
	assert.equal(messages.length, 1);
	assert.match(JSON.stringify(messages[0]), /uncommitted/);
});

test("buildReviewTask describes uncommitted and branch scopes", () => {
	const context = {
		storyId: "12",
		storyName: "登录",
		understandingFile: "/u.md",
		designFile: "/d.md",
		contextFile: "/g.md",
		repositoryRoot: "/repo",
		branch: "feature",
		scope: "uncommitted" as const,
		baseRef: "origin/dev",
		mergeBase: "abc",
	};
	assert.match(buildReviewTask(context), /HEAD through the current working tree/);
	assert.match(
		buildReviewTask({ ...context, scope: "branch" }, "extra"),
		/merge-base abc/,
	);
	assert.match(buildReviewTask({ ...context, scope: "branch" }, "extra"), /extra/);
});
