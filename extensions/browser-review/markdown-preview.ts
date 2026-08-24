import { renderMermaidSVG } from "beautiful-mermaid";
import {
	marked,
	Renderer,
	type Token,
	type Tokens,
	type TokensList,
} from "marked";
import type { MarkdownReviewBlock } from "./types.js";

const MARKED_OPTIONS = { gfm: true, breaks: false } as const;

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => {
		switch (character) {
			case "&": return "&amp;";
			case "<": return "&lt;";
			case ">": return "&gt;";
			case '"': return "&quot;";
			default: return "&#39;";
		}
	});
}

function safeHref(value: string): string | undefined {
	if (value.startsWith("#")) return value;
	try {
		const url = new URL(value);
		return ["http:", "https:", "mailto:"].includes(url.protocol)
			? value
			: undefined;
	} catch {
		return undefined;
	}
}

function codeBlock(text: string, language?: string): string {
	const name = language?.trim().split(/\s+/, 1)[0];
	const className = name ? ` class="language-${escapeHtml(name)}"` : "";
	return `<pre><code${className}>${escapeHtml(text)}\n</code></pre>`;
}

function localSvg(svg: string): string {
	if (!svg.trimStart().startsWith("<svg")) throw new Error("Invalid SVG");
	return svg.replace(/\s*@import\s+url\([^)]*\)\s*;?/gi, "");
}

function mermaidBlock(text: string): string {
	try {
		const svg = localSvg(renderMermaidSVG(text, {
			bg: "#0f151f",
			fg: "#e3e9f2",
			line: "#73849b",
			accent: "#5ba7ff",
			muted: "#91a0b5",
			surface: "#182231",
			border: "#40506a",
			font: "Inter, system-ui, sans-serif",
			transparent: true,
			padding: 32,
			nodeSpacing: 36,
			layerSpacing: 52,
		}));
		const source = Buffer.from(svg).toString("base64");
		return `<figure class="md-mermaid"><img class="md-mermaid-svg" src="data:image/svg+xml;base64,${source}" alt="Mermaid 图"></figure>`;
	} catch {
		return `${codeBlock(text, "mermaid")}<p class="md-mermaid-warning">Mermaid 图无法渲染</p>`;
	}
}

function createSafeRenderer(): Renderer {
	const renderer = new Renderer();
	renderer.code = ({ text, lang }: Tokens.Code) =>
		lang?.trim().split(/\s+/, 1)[0]?.toLowerCase() === "mermaid"
			? mermaidBlock(text)
			: codeBlock(text, lang);
	renderer.html = ({ text }: Tokens.HTML | Tokens.Tag) =>
		`<pre class="md-raw-html"><code>${escapeHtml(text)}</code></pre>`;
	renderer.image = ({ text, title }: Tokens.Image) => {
		const label = text || "未命名图片";
		const tooltip = title ? ` title="${escapeHtml(title)}"` : "";
		return `<span class="md-image"${tooltip}>[图片: ${escapeHtml(label)}]</span>`;
	};
	renderer.link = function ({ href, title, tokens }: Tokens.Link) {
		const text = this.parser.parseInline(tokens) as string;
		const safe = safeHref(href);
		if (!safe) return text;
		const tooltip = title ? ` title="${escapeHtml(title)}"` : "";
		return `<a href="${escapeHtml(safe)}"${tooltip} target="_blank" rel="noreferrer noopener">${text}</a>`;
	};
	return renderer;
}

function lineCount(value: string): number {
	return (value.match(/\n/g) ?? []).length;
}

function tokenRange(
	markdown: string,
	raw: string,
	cursor: number,
): { startLine: number; endLine: number; nextCursor: number } {
	const found = markdown.indexOf(raw, cursor);
	const start = found >= 0 ? found : cursor;
	const visibleRaw = raw.replace(/(?:\r?\n)+$/, "");
	const startLine = lineCount(markdown.slice(0, start));
	return {
		startLine,
		endLine: startLine + lineCount(visibleRaw),
		nextCursor: start + raw.length,
	};
}

function singleTokenList(token: Token, links: TokensList["links"]): TokensList {
	const list = [token] as TokensList;
	list.links = links;
	return list;
}

export function renderMarkdownBlocks(markdown: string): MarkdownReviewBlock[] {
	const tokens = marked.lexer(markdown, MARKED_OPTIONS);
	const renderer = createSafeRenderer();
	const blocks: MarkdownReviewBlock[] = [];
	let cursor = 0;
	for (const token of tokens) {
		const range = tokenRange(markdown, token.raw, cursor);
		cursor = range.nextCursor;
		if (token.type === "space" || token.type === "def") continue;
		const html = marked.parser(singleTokenList(token, tokens.links), {
			...MARKED_OPTIONS,
			renderer,
		});
		if (!html.trim()) continue;
		blocks.push({ ...range, html });
	}
	return blocks;
}
