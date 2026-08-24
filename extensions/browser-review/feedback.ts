import type {
	BrowserReviewResult,
	BrowserReviewSource,
	ReviewAnnotation,
} from "./types.js";

const MAX_ANNOTATIONS = 100;
const MAX_COMMENT_LENGTH = 8_000;

interface SubmittedAnnotation {
	startLine?: unknown;
	endLine?: unknown;
	comment?: unknown;
}

function lineLabel(source: BrowserReviewSource, index: number): string {
	const line = source.lines[index];
	if (source.kind !== "code") return `L${index + 1}`;
	const position = line.newLine !== undefined
		? `L${line.newLine}`
		: line.oldLine !== undefined
			? `old L${line.oldLine}`
			: `view L${index + 1}`;
	return line.file ? `${line.file}:${position}` : position;
}

export function validateAnnotations(
	source: BrowserReviewSource,
	value: unknown,
): ReviewAnnotation[] {
	if (!Array.isArray(value) || value.length > MAX_ANNOTATIONS) {
		throw new Error("批注列表无效或数量过多");
	}
	return value.map((item: SubmittedAnnotation) => {
		const start = item?.startLine;
		const end = item?.endLine;
		const comment = typeof item?.comment === "string" ? item.comment.trim() : "";
		if (
			!Number.isInteger(start) ||
			!Number.isInteger(end) ||
			(start as number) < 0 ||
			(end as number) < (start as number) ||
			(end as number) >= source.lines.length
		) {
			throw new Error("批注行范围无效");
		}
		if (!comment || comment.length > MAX_COMMENT_LENGTH) {
			throw new Error("批注内容为空或过长");
		}
		const quote = source.lines
			.slice(start as number, (end as number) + 1)
			.map((line) => line.text)
			.join("\n");
		return {
			startLine: start as number,
			endLine: end as number,
			comment,
			quote,
		};
	});
}

export function formatReviewFeedback(
	source: BrowserReviewSource,
	annotations: ReviewAnnotation[],
): string {
	return [
		`## 浏览器审阅反馈：${source.title}`,
		source.subtitle ? `\n${source.subtitle}` : "",
		...annotations.flatMap((annotation, index) => {
			const start = lineLabel(source, annotation.startLine);
			const end = lineLabel(source, annotation.endLine);
			return [
				`\n### ${index + 1}. ${start}${start === end ? "" : `–${end}`}`,
				"```text",
				annotation.quote,
				"```",
				annotation.comment,
			];
		}),
	]
		.filter(Boolean)
		.join("\n");
}

export function processReviewSubmission(
	source: BrowserReviewSource,
	value: unknown,
): BrowserReviewResult {
	const body = value as Record<string, unknown> | null;
	if (!body || typeof body !== "object") throw new Error("提交内容无效");
	if (body.action === "cancel") return { status: "closed" };
	const annotations = validateAnnotations(source, body.annotations);
	if (body.action === "approve" && source.kind === "plan") {
		return { status: "approved", annotations };
	}
	if (body.action !== "feedback" || annotations.length === 0) {
		throw new Error("请至少添加一条批注");
	}
	return {
		status: "feedback",
		annotations,
		feedback: formatReviewFeedback(source, annotations),
	};
}
