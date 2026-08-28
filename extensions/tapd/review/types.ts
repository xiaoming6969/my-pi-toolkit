export type TapdReviewScope = "uncommitted" | "branch";

export interface TapdReviewTarget {
	storyId: string;
	storyName: string;
	understandingFile: string;
	designFile: string;
}
