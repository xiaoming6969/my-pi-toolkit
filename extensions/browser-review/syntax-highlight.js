import { basename, extname } from "node:path";
import hljs from "highlight.js";

export function escapeHtml(value) {
	return value.replace(/[&<>"']/g, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;",
	})[character]);
}

export function highlightHtml(code, language) {
	const name = language?.trim().split(/\s+/, 1)[0]?.toLowerCase();
	return name && hljs.getLanguage(name)
		? hljs.highlight(code, { language: name, ignoreIllegals: true }).value
		: escapeHtml(code);
}

export function highlightDiffLine(text, file) {
	const name = file ? basename(file).toLowerCase() : "";
	const language = extname(name).slice(1) || ({
		dockerfile: "dockerfile",
		makefile: "makefile",
		"cmakelists.txt": "cmake",
	}[name]);
	return escapeHtml(text.slice(0, 1)) + highlightHtml(text.slice(1), language);
}
