import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdownBlocks } from "../markdown-preview.ts";

const markdown = [
	"# 设计方案",
	"",
	"第一段包含 **重点** 和 `code`。",
	"",
	"- 项目一",
	"- 项目二",
	"",
	"| 名称 | 状态 |",
	"| --- | --- |",
	"| API | 完成 |",
	"",
	"> 注意兼容性",
	"",
	"```ts",
	"const ready = true;",
	"```",
].join("\n");

test("renders GFM blocks with source line ranges", () => {
	const blocks = renderMarkdownBlocks(markdown);
	assert.equal(blocks[0].startLine, 0);
	assert.equal(blocks[0].endLine, 0);
	assert.match(blocks[0].html, /<h1>设计方案<\/h1>/);
	assert.deepEqual(
		blocks.map(({ startLine, endLine }) => [startLine, endLine]),
		[[0, 0], [2, 2], [4, 5], [7, 9], [11, 11], [13, 15]],
	);
	assert.match(blocks[2].html, /<ul>/);
	assert.match(blocks[3].html, /<table>/);
	assert.match(blocks[5].html, /language-ts/);
});

test("renders Mermaid fences as responsive SVG diagrams", () => {
	const [block] = renderMarkdownBlocks([
		"```mermaid",
		"flowchart LR",
		"  A[Start] --> B[Done]",
		"```",
	].join("\n"));
	assert.match(block.html, /<figure class="md-mermaid">/);
	const encoded = block.html.match(/src="data:image\/svg\+xml;base64,([^"]+)"/)?.[1];
	assert.ok(encoded);
	const svg = Buffer.from(encoded, "base64").toString("utf8");
	assert.match(svg, /^<svg[^>]+viewBox=/);
	assert.match(svg, />Start<\/text>/);
	assert.match(svg, />Done<\/text>/);
	assert.doesNotMatch(svg, /@import|<script|url\(["']?https?:/i);
	assert.doesNotMatch(block.html, /<code class="language-mermaid">/);
});

test("falls back to escaped source for unsupported Mermaid", () => {
	const [block] = renderMarkdownBlocks([
		"```mermaid",
		"pie title Pets",
		"  \"Dogs\" : 3",
		"```",
	].join("\n"));
	assert.match(block.html, /language-mermaid/);
	assert.match(block.html, /Mermaid 图无法渲染/);
});

test("escapes raw HTML and blocks unsafe links and images", () => {
	const blocks = renderMarkdownBlocks([
		"<script>alert('xss')</script>",
		"",
		"[bad](javascript:alert(1)) [good](https://example.com)",
		"",
		"![remote](https://example.com/pixel.png)",
	].join("\n"));
	const html = blocks.map((block) => block.html).join("\n");
	assert.doesNotMatch(html, /<script/i);
	assert.match(html, /&lt;script&gt;/);
	assert.doesNotMatch(html, /href="javascript:/i);
	assert.match(html, /href="https:\/\/example\.com"/);
	assert.match(html, /rel="noreferrer noopener"/);
	assert.doesNotMatch(html, /<img/i);
	assert.match(html, /\[图片: remote\]/);
});
