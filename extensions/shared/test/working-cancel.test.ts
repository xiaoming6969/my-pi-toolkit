import test from "node:test";
import assert from "node:assert/strict";
import { abortError, isAbortError, withWorking } from "../tui/working-cancel.ts";
import { createFakeContext } from "./fake-extension.ts";

test("abortError is an AbortError that isAbortError recognizes", () => {
	const error = abortError();
	assert.equal(error.name, "AbortError");
	assert.match(error.message, /已取消/);
	assert.equal(isAbortError(error), true);
	assert.equal(isAbortError(new Error("nope")), false);
	assert.equal(isAbortError("aborted"), false);
});

test("withWorking skips the widget without UI and returns the result", async () => {
	const ctx = createFakeContext({ hasUI: false });
	const value = await withWorking(ctx, "k", async (working) => {
		assert.equal(working, undefined);
		return 9;
	});
	assert.equal(value, 9);
});

test("withWorking shows then clears the widget when UI is available", async () => {
	const ctx = createFakeContext({ hasUI: true });
	const value = await withWorking(
		ctx,
		"k",
		async (working) => {
			assert.ok(working);
			assert.equal(ctx.widgets.has("k"), true);
			return "ok";
		},
		{ message: "Working... 正在加载" },
	);
	assert.equal(value, "ok");
	assert.equal(ctx.widgets.get("k"), undefined);
});

test("withWorking notifyAbort swallows AbortError", async () => {
	const ctx = createFakeContext({ hasUI: false });
	const value = await withWorking(
		ctx,
		"k",
		async () => {
			throw abortError();
		},
		{ notifyAbort: true },
	);
	assert.equal(value, undefined);
	assert.match(ctx.notifies[0]?.message ?? "", /已取消/);
});

test("withWorking rethrows other errors", async () => {
	const ctx = createFakeContext({ hasUI: false });
	await assert.rejects(
		() =>
			withWorking(ctx, "k", async () => {
				throw new Error("boom");
			}),
		/boom/,
	);
});
