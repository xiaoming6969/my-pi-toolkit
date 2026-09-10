import { html, parse } from "diff2html";

const OPTIONS = {
	drawFileList: false,
	matching: "words" as const,
	diffStyle: "word" as const,
	colorScheme: "dark" as const,
};

export function renderDiffHtml(
	patch: string,
	outputFormat: "side-by-side" | "line-by-line",
): string {
	const chunks = splitPatchFiles(patch);
	if (chunks.length === 0) return fallbackPre(patch);
	return chunks.map((chunk) => renderChunk(chunk, outputFormat)).join("");
}

function renderChunk(chunk: string, outputFormat: "side-by-side" | "line-by-line"): string {
	const files = parse(chunk);
	if (files.length === 0 || files.every((file) => file.blocks.length === 0)) {
		return fallbackPre(chunk, files[0]?.newName);
	}
	return html(files, { ...OPTIONS, outputFormat });
}

function splitPatchFiles(patch: string): string[] {
	return patch.split(/(?=^diff --git )/m).filter((chunk) => chunk.trim());
}

function fallbackPre(text: string, file?: string): string {
	const name = file ? ` data-file="${escapeHtml(file)}"` : "";
	return `<pre class="d2h-fallback"${name}>${escapeHtml(text)}</pre>`;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => {
		return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character;
	});
}
