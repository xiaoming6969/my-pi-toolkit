import test from "node:test";
import assert from "node:assert/strict";
import { abortError, isAbortError } from "../tui/working-cancel.ts";

test("abortError is an AbortError that isAbortError recognizes", () => {
	const error = abortError();
	assert.equal(error.name, "AbortError");
	assert.match(error.message, /已取消/);
	assert.equal(isAbortError(error), true);
	assert.equal(isAbortError(new Error("nope")), false);
	assert.equal(isAbortError("aborted"), false);
});
