import assert from "node:assert/strict";
import test from "node:test";
import {
	formatReviewFeedback,
	processReviewSubmission,
	validateAnnotations,
} from "../feedback.ts";

const source = {
	kind: "document",
	title: "design.md",
	lines: [{ text: "first" }, { text: "second" }, { text: "third" }],
};

test("annotations are validated and quotes come from the server source", () => {
	const annotations = validateAnnotations(source, [
		{ startLine: 0, endLine: 1, comment: "  revise this  ", quote: "forged" },
	]);
	assert.deepEqual(annotations, [
		{
			startLine: 0,
			endLine: 1,
			comment: "revise this",
			quote: "first\nsecond",
		},
	]);
	assert.match(formatReviewFeedback(source, annotations), /L1–L2/);
	assert.match(formatReviewFeedback(source, annotations), /first\nsecond/);
});

test("invalid annotation ranges and empty comments are rejected", () => {
	assert.throws(() => validateAnnotations(source, [{ startLine: -1, endLine: 0, comment: "x" }]));
	assert.throws(() => validateAnnotations(source, [{ startLine: 0, endLine: 9, comment: "x" }]));
	assert.throws(() => validateAnnotations(source, [{ startLine: 0, endLine: 0, comment: " " }]));
});

test("submission maps cancel, feedback and plan approval", () => {
	assert.deepEqual(processReviewSubmission(source, { action: "cancel" }), { status: "closed" });
	const feedback = processReviewSubmission(source, {
		action: "feedback",
		annotations: [{ startLine: 1, endLine: 1, comment: "change" }],
	});
	assert.equal(feedback.status, "feedback");
	assert.match(feedback.feedback, /change/);
	const approved = processReviewSubmission(
		{ ...source, kind: "plan" },
		{ action: "approve", annotations: [] },
	);
	assert.equal(approved.status, "approved");
	const plan = { ...source, kind: "plan" };
	assert.deepEqual(
		processReviewSubmission(plan, { action: "defer", annotations: [] }),
		{ status: "deferred" },
	);
	assert.deepEqual(
		processReviewSubmission(plan, { action: "abandon", annotations: [] }),
		{ status: "abandoned" },
	);
	assert.throws(() =>
		processReviewSubmission(plan, { action: "feedback", annotations: [] }),
	);
	assert.throws(() => processReviewSubmission(source, { action: "approve", annotations: [] }));
	const code = {
		kind: "code",
		title: "diff",
		lines: [
			{ text: "-old", oldLine: 3 },
			{ text: "view only" },
			{ text: "+new", file: "app.ts", newLine: 4 },
		],
	};
	const labeled = validateAnnotations(code, [
		{ startLine: 0, endLine: 0, comment: "old" },
		{ startLine: 1, endLine: 1, comment: "view" },
		{ startLine: 2, endLine: 2, comment: "new" },
	]);
	assert.match(formatReviewFeedback(code, labeled), /old L3/);
	assert.match(formatReviewFeedback(code, labeled), /view L2/);
	assert.match(formatReviewFeedback(code, labeled), /app.ts:L4/);
});
