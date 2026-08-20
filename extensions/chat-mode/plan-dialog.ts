import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { showMarkdownPreview } from "../shared/tui/markdown-preview-overlay.js";

export async function showPlanDialog(
	ctx: ExtensionContext,
	planPath: string,
	planContent: string | undefined,
): Promise<void> {
	await showMarkdownPreview(ctx, {
		title: "PLAN REVIEW",
		path: planPath,
		content: planContent,
		emptyMessage: "_该 Plan 尚未写入内容。_",
	});
}
