export type BrowserReviewKind = "plan" | "document" | "code" | "message";

export type ReviewLineStyle =
	| "plain"
	| "file"
	| "hunk"
	| "addition"
	| "deletion"
	| "context"
	| "notice";

export interface ReviewLine {
	text: string;
	style?: ReviewLineStyle;
	file?: string;
	oldLine?: number;
	newLine?: number;
}

export interface MarkdownReviewBlock {
	startLine: number;
	endLine: number;
	html: string;
}

export interface BrowserReviewSource {
	kind: BrowserReviewKind;
	title: string;
	subtitle?: string;
	lines: ReviewLine[];
	markdownBlocks?: MarkdownReviewBlock[];
}

export interface ReviewAnnotation {
	startLine: number;
	endLine: number;
	comment: string;
	quote: string;
}

export type BrowserReviewResult =
	| { status: "approved"; annotations: ReviewAnnotation[] }
	| { status: "deferred" }
	| { status: "abandoned" }
	| { status: "feedback"; annotations: ReviewAnnotation[]; feedback: string }
	| { status: "closed" }
	| { status: "unavailable"; error: string };

export interface BrowserReviewOpenOptions {
	signal?: AbortSignal;
	openBrowser?: (url: string) => Promise<string | null>;
}
