import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	Editor,
	type EditorTheme,
	type Focusable,
	Key,
	matchesKey,
	type TUI,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { statusGlyph } from "./tui/visual-language.js";

export interface ChoiceOption {
	label: string;
	description?: string;
	recommended?: boolean;
}

export interface ChoiceQuestion {
	question: string;
	options: ChoiceOption[];
}

export interface ChoiceAnswer {
	question: string;
	answer: string;
	optionIndex?: number;
	wasCustom: boolean;
}

export interface ChoiceDialogResult {
	answers: ChoiceAnswer[];
	cancelled: boolean;
}

function optionLetter(index: number): string {
	return String.fromCharCode("A".charCodeAt(0) + index);
}

export class AskUserChoiceDialog implements Focusable {
	private tab = 0;
	private selected = 0;
	private inputQuestion = -1;
	private cachedWidth?: number;
	private cachedLines?: string[];
	private readonly answers = new Map<number, ChoiceAnswer>();
	private readonly editor: Editor;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.editor.focused = value;
	}

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly questions: ChoiceQuestion[],
		private readonly done: (result: ChoiceDialogResult) => void,
	) {
		const editorTheme: EditorTheme = {
			borderColor: (text) => theme.fg("accent", text),
			selectList: {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			},
		};
		this.editor = new Editor(tui, editorTheme);
		this.editor.onSubmit = (value) => this.saveCustom(value);
	}

	private refresh(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
		this.tui.requestRender();
	}

	private currentQuestion(): ChoiceQuestion | undefined {
		return this.questions[this.tab];
	}

	private allAnswered(): boolean {
		return this.answers.size === this.questions.length;
	}

	private result(cancelled: boolean): ChoiceDialogResult {
		return {
			answers: this.questions.flatMap((_, index) => {
				const answer = this.answers.get(index);
				return answer ? [answer] : [];
			}),
			cancelled,
		};
	}

	private moveTab(delta: number): void {
		const totalTabs = this.questions.length + 1;
		this.tab = (this.tab + delta + totalTabs) % totalTabs;
		const answer = this.answers.get(this.tab);
		this.selected = answer?.wasCustom
			? (this.currentQuestion()?.options.length ?? 0)
			: (answer?.optionIndex ?? 0);
		this.refresh();
	}

	private advance(): void {
		if (this.questions.length === 1) {
			this.done(this.result(false));
			return;
		}
		this.tab = Math.min(this.tab + 1, this.questions.length);
		this.selected = this.answers.get(this.tab)?.optionIndex ?? 0;
		this.refresh();
	}

	private saveCustom(value: string): void {
		const text = value.trim();
		if (!text || this.inputQuestion < 0) return;
		const question = this.questions[this.inputQuestion];
		this.answers.set(this.inputQuestion, {
			question: question.question,
			answer: text,
			wasCustom: true,
		});
		this.inputQuestion = -1;
		this.editor.setText("");
		this.advance();
	}

	handleInput(data: string): void {
		if (this.inputQuestion >= 0) {
			if (matchesKey(data, Key.escape)) {
				this.inputQuestion = -1;
				this.editor.setText("");
				this.refresh();
				return;
			}
			this.editor.handleInput(data);
			this.refresh();
			return;
		}

		if (matchesKey(data, Key.escape)) {
			this.done(this.result(true));
			return;
		}
		if (this.questions.length > 1) {
			if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
				this.moveTab(1);
				return;
			}
			if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
				this.moveTab(-1);
				return;
			}
		}
		if (this.tab === this.questions.length) {
			if (matchesKey(data, Key.enter) && this.allAnswered()) {
				this.done(this.result(false));
			}
			return;
		}

		const question = this.currentQuestion();
		if (!question) return;
		const customIndex = question.options.length;
		if (matchesKey(data, Key.up)) {
			this.selected = Math.max(0, this.selected - 1);
			this.refresh();
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.selected = Math.min(customIndex, this.selected + 1);
			this.refresh();
			return;
		}
		if (!matchesKey(data, Key.enter)) return;
		if (this.selected === customIndex) {
			this.inputQuestion = this.tab;
			this.editor.setText(this.answers.get(this.tab)?.wasCustom ? this.answers.get(this.tab)?.answer ?? "" : "");
			this.refresh();
			return;
		}
		const option = question.options[this.selected];
		this.answers.set(this.tab, {
			question: question.question,
			answer: option.label,
			optionIndex: this.selected,
			wasCustom: false,
		});
		this.advance();
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		const renderWidth = Math.max(1, width);
		const lines: string[] = [];
		const add = (text: string, prefix = " ") => {
			const prefixWidth = visibleWidth(prefix);
			const wrapped = wrapTextWithAnsi(text, Math.max(1, renderWidth - prefixWidth));
			for (let i = 0; i < wrapped.length; i++) {
				lines.push(`${i === 0 ? prefix : " ".repeat(prefixWidth)}${wrapped[i]}`);
			}
		};

		lines.push(this.theme.fg("borderMuted", "─".repeat(renderWidth)));
		if (this.questions.length > 1) {
			const tabs = this.questions.map((_, index) => {
				const glyph = statusGlyph(this.theme, this.answers.has(index) ? "success" : "pending");
				const text = ` ${glyph} ${index + 1} `;
				return index === this.tab ? this.theme.bg("selectedBg", text) : text;
			});
			const submit = ` ${statusGlyph(this.theme, this.allAnswered() ? "success" : "pending")} 提交 `;
			tabs.push(this.tab === this.questions.length ? this.theme.bg("selectedBg", submit) : submit);
			add(tabs.join(" "));
			lines.push("");
		}

		const question = this.currentQuestion();
		if (this.tab === this.questions.length) {
			add(this.theme.fg("accent", this.theme.bold("确认全部答案")));
			lines.push("");
			this.questions.forEach((item, index) => {
				const answer = this.answers.get(index);
				add(`${this.theme.fg("muted", `${index + 1}. `)}${answer ? answer.answer : this.theme.fg("warning", "未回答")}`);
			});
			lines.push("");
			add(this.theme.fg(this.allAnswered() ? "success" : "warning", this.allAnswered() ? "Enter 提交" : "请先回答全部问题"));
		} else if (question) {
			add(this.theme.fg("text", `${this.tab + 1}/${this.questions.length} ${question.question}`));
			lines.push("");
			question.options.forEach((option, index) => {
				const selected = index === this.selected;
				const recommendation = option.recommended ? "（推荐）" : "";
				add(this.theme.fg(selected ? "accent" : "text", `${optionLetter(index)}${recommendation}: ${option.label}`), selected ? "> " : "  ");
				if (option.description) add(this.theme.fg("muted", option.description), "    ");
			});
			const customIndex = question.options.length;
			add(this.theme.fg(this.selected === customIndex ? "accent" : "text", `${optionLetter(customIndex)}: 其他（自定义输入）`), this.selected === customIndex ? "> " : "  ");
			if (this.inputQuestion >= 0) {
				lines.push("");
				add(this.theme.fg("muted", "请输入自定义方案："));
				for (const line of this.editor.render(Math.max(1, renderWidth - 2))) lines.push(` ${line}`);
			}
		}
		lines.push("");
		add(this.theme.fg("dim", this.inputQuestion >= 0 ? "Enter 确认 · Esc 返回" : this.questions.length > 1 ? "Tab/Shift+Tab 切题 · ↑↓ 选择 · Enter 确认 · Esc 取消" : "↑↓ 选择 · Enter 确认 · Esc 取消"));
		lines.push(this.theme.fg("borderMuted", "─".repeat(renderWidth)));
		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
		this.editor.invalidate();
	}
}
