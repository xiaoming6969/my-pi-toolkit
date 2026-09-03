import { truncateHead } from "@earendil-works/pi-coding-agent";

const MAX_RESULT_BYTES = 50 * 1024;
const MAX_RESULT_LINES = 2000;

export interface VisibleSubagentOutput {
	content: string;
	truncated: boolean;
}

/**
 * Cap the text returned to the parent agent so a verbose child cannot crowd
 * out the parent's context window. Full output stays in tool `details`.
 */
export function truncateSubagentOutput(
	output: string,
	notice: string,
): VisibleSubagentOutput {
	const truncation = truncateHead(output, {
		maxBytes: MAX_RESULT_BYTES,
		maxLines: MAX_RESULT_LINES,
	});
	return {
		content: truncation.truncated
			? `${truncation.content}\n\n${notice}`
			: truncation.content,
		truncated: truncation.truncated,
	};
}
