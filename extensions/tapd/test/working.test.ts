import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { abortError, withTapdWorking } from "../working.ts";
import { createFakeContext } from "../../shared/test/fake-extension.ts";

test("withTapdWorking skips the spinner without UI and returns the result", async () => {
	const ctx = createFakeContext({ hasUI: false });
	const value = await withTapdWorking(ctx, "k", async (cancel) => {
		assert.equal(cancel, undefined);
		return 7;
	});
	assert.equal(value, 7);
});

test("withTapdWorking notifies and swallows abort errors", async () => {
	const ctx = createFakeContext({ hasUI: false });
	const value = await withTapdWorking(ctx, "k", async () => {
		throw abortError();
	});
	assert.equal(value, undefined);
	assert.match(ctx.notifies[0]?.message ?? "", /已取消/);
});

test("withTapdWorking rethrows other errors", async () => {
	const ctx = createFakeContext({ hasUI: false }) as ExtensionContext;
	await assert.rejects(
		() => withTapdWorking(ctx, "k", async () => {
			throw new Error("boom");
		}),
		/boom/,
	);
});
