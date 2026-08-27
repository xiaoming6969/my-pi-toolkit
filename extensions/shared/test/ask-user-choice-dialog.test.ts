import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { type TUI, visibleWidth } from "@earendil-works/pi-tui";
import {
	AskUserChoiceDialog,
	type ChoiceDialogResult,
	type ChoiceQuestion,
} from "../ask-user-choice-dialog.ts";
import { normalizeChoiceQuestions } from "../ask-user-choice-tool.ts";

const tui = { requestRender() {} } as TUI;
const theme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;
const questions: ChoiceQuestion[] = ["范围", "子表", "历史字段"].map(
	(question) => ({
		question,
		options: [{ label: "A" }, { label: "B" }],
	}),
);

test("collects tabbed answers in question order and blocks incomplete submit", () => {
	let result: ChoiceDialogResult | undefined;
	const dialog = new AskUserChoiceDialog(tui, theme, questions, (value) => {
		result = value;
	});

	dialog.handleInput("\r"); // Q1=A, advances to Q2
	dialog.handleInput("\t"); // Q3
	dialog.handleInput("\x1b[B");
	dialog.handleInput("\r"); // Q3=B, advances to Submit
	dialog.handleInput("\r"); // unanswered Q2: no submit
	assert.equal(result, undefined);

	dialog.handleInput("\x1b[Z"); // Q3
	dialog.handleInput("\x1b[Z"); // Q2
	dialog.handleInput("\r"); // Q2=A
	dialog.handleInput("\t"); // Submit
	dialog.handleInput("\r");

	assert.ok(result);
	const submitted = result as ChoiceDialogResult;
	assert.deepEqual(
		submitted.answers.map((answer) => answer.answer),
		["A", "A", "B"],
	);
	assert.equal(submitted.cancelled, false);
});

test("keeps questionnaire output within responsive widths", () => {
	const dialog = new AskUserChoiceDialog(tui, theme, questions, () => {});
	for (const width of [20, 60, 80, 120, 160]) {
		assert.ok(
			dialog.render(width).every((line) => visibleWidth(line) <= width),
			`render exceeded ${width} columns`,
		);
	}
});

test("supports custom input, legacy params, and whole-dialog cancellation", () => {
	const legacy = normalizeChoiceQuestions({
		question: "旧调用",
		options: questions[0].options,
	});
	assert.equal(legacy.length, 1);
	let custom: ChoiceDialogResult | undefined;
	const customDialog = new AskUserChoiceDialog(tui, theme, legacy, (result) => {
		custom = result;
	});
	customDialog.handleInput("\x1b[B");
	customDialog.handleInput("\x1b[B");
	customDialog.handleInput("\r");
	for (const char of "自定义") customDialog.handleInput(char);
	customDialog.handleInput("\r");
	assert.equal((custom as ChoiceDialogResult | undefined)?.answers[0]?.answer, "自定义");
	assert.equal((custom as ChoiceDialogResult | undefined)?.answers[0]?.wasCustom, true);

	let cancelled = false;
	const dialog = new AskUserChoiceDialog(tui, theme, questions, (result) => {
		cancelled = result.cancelled;
	});
	dialog.handleInput("\x1b");
	assert.equal(cancelled, true);
});
