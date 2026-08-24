import type {
	AgentToolResult,
	ExtensionAPI,
	ExtensionContext,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	AskUserChoiceDialog,
	type ChoiceAnswer,
	type ChoiceDialogResult,
	type ChoiceOption,
	type ChoiceQuestion,
} from "./ask-user-choice-dialog.js";
import { compactText } from "./tui/tool-format.js";
import { toolCall, toolResult } from "./tui/tool-render.js";

interface AskUserChoiceParams {
	questions?: ChoiceQuestion[];
	/** Legacy single-question shape retained for old transcripts and callers. */
	question?: string;
	options?: ChoiceOption[];
}

interface AskUserChoiceDetails {
	questions: ChoiceQuestion[];
	answers: ChoiceAnswer[];
	cancelled: boolean;
	/** Legacy single-answer fields retained for transcript compatibility. */
	question?: string;
	answer?: string;
	optionIndex?: number;
	wasCustom?: boolean;
}

const OptionSchema = Type.Object({
	label: Type.String({ description: "Concise answer shown in the selector." }),
	description: Type.Optional(
		Type.String({ description: "Reason, trade-off, or impact of this option." }),
	),
	recommended: Type.Optional(
		Type.Boolean({ description: "Mark at most one option as recommended." }),
	),
});

const QuestionSchema = Type.Object({
	question: Type.String({ description: "One specific decision to confirm." }),
	options: Type.Array(OptionSchema, {
		description: "Two to five concrete choices. Custom input is added automatically.",
		minItems: 2,
		maxItems: 5,
	}),
});

function optionLetter(index: number): string {
	return String.fromCharCode("A".charCodeAt(0) + index);
}

export function normalizeChoiceQuestions(
	params: AskUserChoiceParams,
): ChoiceQuestion[] {
	const source = params.questions?.length
		? params.questions
		: params.question && params.options
			? [{ question: params.question, options: params.options }]
			: [];
	if (source.length === 0) throw new Error("至少需要一个待确认问题");
	if (source.length > 8) throw new Error("一次最多确认 8 个问题");
	return source.map((item, index) => {
		const question = item.question.trim();
		if (!question) throw new Error(`第 ${index + 1} 个问题不能为空`);
		if (item.options.length < 2 || item.options.length > 5) {
			throw new Error(`第 ${index + 1} 个问题必须提供 2～5 个选项`);
		}
		if (item.options.filter((option) => option.recommended).length > 1) {
			throw new Error(`第 ${index + 1} 个问题最多只能有一个推荐选项`);
		}
		return {
			question,
			options: item.options.map((option) => ({
				...option,
				label: option.label.trim(),
				description: option.description?.trim() || undefined,
			})),
		};
	});
}

function detailsFor(
	questions: ChoiceQuestion[],
	answers: ChoiceAnswer[],
	cancelled: boolean,
): AskUserChoiceDetails {
	const first = answers[0];
	return {
		questions,
		answers,
		cancelled,
		question: questions.length === 1 ? questions[0]?.question : undefined,
		answer: questions.length === 1 ? first?.answer : undefined,
		optionIndex: questions.length === 1 ? first?.optionIndex : undefined,
		wasCustom: questions.length === 1 ? first?.wasCustom : undefined,
	};
}

function cancelledResult(questions: ChoiceQuestion[], message: string) {
	return {
		content: [{ type: "text" as const, text: message }],
		details: detailsFor(questions, [], true),
	};
}

function answerText(answer: ChoiceAnswer, index: number): string {
	const prefix = answer.wasCustom
		? "自定义"
		: optionLetter(answer.optionIndex ?? 0);
	return `决策 ${index + 1}: ${prefix}: ${answer.answer}`;
}

export function registerAskUserChoiceTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ask_user_choice",
		label: "Ask User Choice",
		description:
			"Ask one blocking questionnaire containing all material clarification decisions. The user answers every question in one tabbed interface; a final custom-input option is added to each question.",
		promptSnippet:
			"Ask all blocking clarification decisions together with recommended choices or custom input",
		promptGuidelines: [
			"Use ask_user_choice for unresolved decisions that materially affect a plan or design; investigate available context first and do not ask what repository evidence already answers.",
			"Collect all currently known material decisions into one questions array instead of calling the tool once per question. Each question needs 2-5 concrete options, key trade-offs, and at most one recommended choice; custom input is added automatically.",
			"If ask_user_choice reports cancellation, stop the current planning or design workflow instead of inferring answers.",
		],
		parameters: Type.Object({
			questions: Type.Optional(
				Type.Array(QuestionSchema, {
					description:
						"All currently known decisions to answer together in one tabbed questionnaire.",
					minItems: 1,
					maxItems: 8,
				}),
			),
			question: Type.Optional(
				Type.String({ description: "Legacy single-question input." }),
			),
			options: Type.Optional(
				Type.Array(OptionSchema, {
					description: "Legacy single-question choices.",
					minItems: 2,
					maxItems: 5,
				}),
			),
		}),
		executionMode: "sequential",

		async execute(
			_toolCallId: string,
			params: AskUserChoiceParams,
			_signal: AbortSignal | undefined,
			_onUpdate: unknown,
			ctx: ExtensionContext,
		) {
			const questions = normalizeChoiceQuestions(params);
			if (!ctx.hasUI) {
				return cancelledResult(questions, "当前运行模式不支持交互式提问");
			}
			const result = await ctx.ui.custom<ChoiceDialogResult>(
				(tui, theme, _keybindings, done) =>
					new AskUserChoiceDialog(tui, theme, questions, done),
			);
			if (result.cancelled) {
				return cancelledResult(questions, "用户取消了确认");
			}
			return {
				content: [
					{
						type: "text" as const,
						text: result.answers.map(answerText).join("\n"),
					},
				],
				details: detailsFor(questions, result.answers, false),
			};
		},

		renderCall(args: AskUserChoiceParams, theme: Theme) {
			const questions = args.questions?.length
				? args.questions
				: args.question
					? [{ question: args.question, options: args.options ?? [] }]
					: [];
			return toolCall(
				theme,
				"ask_user_choice",
				questions.length === 1
					? compactText(questions[0].question, 80)
					: `${questions.length} 个待确认决策`,
				"Tab 切换 · 集中提交",
			);
		},

		renderResult(
			result: AgentToolResult<AskUserChoiceDetails>,
			_options: unknown,
			theme: Theme,
		) {
			const details = result.details as AskUserChoiceDetails | undefined;
			if (!details || details.cancelled) {
				return toolResult(theme, {
					status: "error",
					title: "clarification",
					summary: "cancelled",
				});
			}
			const answers = details.answers?.length
				? details.answers
				: details.answer
					? [{
							question: details.question ?? "",
							answer: details.answer,
							optionIndex: details.optionIndex,
							wasCustom: details.wasCustom ?? false,
						}]
					: [];
			return toolResult(theme, {
				status: "success",
				title: "clarification",
				summary:
					answers.length === 1
						? compactText(answerText(answers[0], 0), 100)
						: `${answers.length} 个决策已确认`,
				details:
					answers.length > 1
						? answers.map((answer, index) =>
								compactText(answerText(answer, index), 120),
							)
						: undefined,
			});
		},
	});
}
