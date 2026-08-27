import assert from "node:assert/strict";
import test from "node:test";
import {
	ENSURE_ASK_FOR_DOCS_CONSUMED_ENTRY,
	ENSURE_ASK_FOR_DOCS_ENTRY,
	wantsAskModeForDocs,
} from "../ensure-ask-for-docs.ts";

const custom = (customType) => ({ type: "custom", customType });
const assistant = { type: "message", message: { role: "assistant" } };

test("TAPD Ask requests are consumed once", () => {
	assert.equal(wantsAskModeForDocs([custom(ENSURE_ASK_FOR_DOCS_ENTRY)]), true);
	assert.equal(
		wantsAskModeForDocs([
			custom(ENSURE_ASK_FOR_DOCS_ENTRY),
			custom(ENSURE_ASK_FOR_DOCS_CONSUMED_ENTRY),
		]),
		false,
	);
	assert.equal(
		wantsAskModeForDocs([
			custom(ENSURE_ASK_FOR_DOCS_ENTRY),
			custom(ENSURE_ASK_FOR_DOCS_CONSUMED_ENTRY),
			custom(ENSURE_ASK_FOR_DOCS_ENTRY),
		]),
		true,
	);
	assert.equal(
		wantsAskModeForDocs([custom(ENSURE_ASK_FOR_DOCS_ENTRY), assistant]),
		false,
	);
});
