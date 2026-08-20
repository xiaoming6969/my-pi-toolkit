/// <reference path="../types/grok-mermaid.d.ts" />

import { render as renderMermaid } from "grok-mermaid";
import {
	getAgentDir,
	SettingsManager,
	type ExtensionContext,
	type MarkdownTransformContext,
	type MarkdownTransformer,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { Marked, type MarkdownOptions } from "@earendil-works/pi-tui";

export type MermaidRenderingMode = "off" | "final" | "streaming";

export interface SharedMarkdownRendering {
	mermaidMode: MermaidRenderingMode;
	transformers: readonly MarkdownTransformer[];
	options(
		messageType: MarkdownTransformContext["messageType"],
		isStreaming?: boolean,
	): MarkdownOptions;
}

const markdownParser = new Marked();

export function createSharedMarkdownRendering(
	ctx: ExtensionContext,
	theme: Theme,
): SharedMarkdownRendering {
	const settings = SettingsManager.create(ctx.cwd, getAgentDir(), {
		projectTrusted: ctx.isProjectTrusted(),
	});
	const mermaidMode = settings.getMermaidRenderingMode();
	const transformers = [createMermaidTransformer(mermaidMode, theme)];
	return {
		mermaidMode,
		transformers,
		options: (messageType, isStreaming = false) => ({
			renderLatex: true,
			transform: (markdown: string, availableWidth: number) =>
				applyMarkdownTransformers(markdown, transformers, {
					messageType,
					isStreaming,
					availableWidth,
				}),
		}),
	};
}

function applyMarkdownTransformers(
	markdown: string,
	transformers: readonly MarkdownTransformer[],
	context: MarkdownTransformContext,
): string {
	return transformers.reduce(
		(current, transformer) => transformer(current, context),
		markdown,
	);
}

function createMermaidTransformer(
	mode: MermaidRenderingMode,
	theme: Theme,
): MarkdownTransformer {
	return (markdown: string, context: MarkdownTransformContext) => {
		if (
			mode === "off" ||
			context.messageType === "assistant-thinking" ||
			(context.isStreaming && mode !== "streaming")
		)
			return markdown;
		return markdownParser
			.lexer(markdown)
			.map((token) => transformToken(token, context.availableWidth, theme))
			.join("");
	};
}

function renderMermaidToFit(source: string, availableWidth: number) {
	const art = renderMermaid(source);
	if (!art || art.width <= availableWidth) return art;

	// Horizontal flowcharts grow quickly with long code labels; preserve the
	// graph while changing only its presentation direction for narrow viewports.
	const vertical = source.replace(
		/^(\s*)(flowchart|graph)\s+(LR|RL)\b/im,
		"$1$2 TD",
	);
	if (vertical === source) return art;
	const reflowed = renderMermaid(vertical);
	return reflowed && reflowed.width <= availableWidth ? reflowed : art;
}

function transformToken(
	token: { type: string; raw: string; lang?: string; text?: string },
	availableWidth: number,
	theme: Theme,
): string {
	if (
		token.type !== "code" ||
		token.lang?.trim().split(/\s+/, 1)[0]?.toLowerCase() !== "mermaid" ||
		typeof token.text !== "string"
	)
		return token.raw;
	try {
		const art = renderMermaidToFit(token.text, availableWidth);
		if (!art || art.width > availableWidth) return token.raw;
		if (art.warnings.length > 0) {
			const extra =
				art.warnings.length > 1 ? ` (+${art.warnings.length - 1})` : "";
			return `${token.raw}\n${codeSpan(theme.fg("warning", `Mermaid diagram not rendered: ${art.warnings[0]}${extra}`))}  \n`;
		}
		return `${art.styled
			.map((row) =>
				codeSpan(row.map((span) => styleSpan(span, theme)).join("")),
			)
			.join("  \n")}\n`;
	} catch {
		return token.raw;
	}
}

function styleSpan(span: { cls: string; text: string }, theme: Theme): string {
	switch (span.cls) {
		case "border":
			return theme.fg("borderMuted", span.text);
		case "edge":
			return theme.fg("accent", span.text);
		case "edgeLabel":
			return theme.fg("muted", span.text);
		case "title":
			return theme.fg("accent", theme.bold(span.text));
		case "text":
			return theme.fg("text", span.text);
		default:
			return span.text;
	}
}

function codeSpan(line: string): string {
	const content = line || " ";
	const longest = Math.max(
		0,
		...Array.from(content.matchAll(/`+/g), (match) => match[0].length),
	);
	const fence = "`".repeat(longest + 1);
	const padding = content.startsWith("`") || content.endsWith("`") ? " " : "";
	return `${fence}${padding}${content}${padding}${fence}`;
}
