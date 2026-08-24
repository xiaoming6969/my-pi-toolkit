import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { BrowserReviewManager } from "../../browser-review/server.js";
import {
	ANALYZE_TRIGGER_PROMPT,
	COLLABORATION_TRIGGER_PROMPT,
	DESIGN_TRIGGER_PROMPT,
} from "./prompts.js";
import {
	isTapdDocumentKind,
	previewTapdDocument,
	snapshotTapdDocument,
	type TapdDocumentKind,
	type TapdDocumentSnapshot,
} from "./preview.js";
import { sendTapdWorkflowPrompt } from "./workflows.js";

const WORKFLOWS: Record<
	string,
	{ kind: TapdDocumentKind; prompt: string }
> = {
	analyze: { kind: "understanding", prompt: ANALYZE_TRIGGER_PROMPT },
	design: { kind: "design", prompt: DESIGN_TRIGGER_PROMPT },
	collaboration: {
		kind: "collaboration",
		prompt: COLLABORATION_TRIGGER_PROMPT,
	},
};

export async function handleTapdPreviewCommand(
	pi: ExtensionAPI,
	reviews: BrowserReviewManager,
	ctx: ExtensionCommandContext,
	subcommand: string,
	args: string[],
): Promise<boolean> {
	if (subcommand !== "preview") return false;
	const requested = args[0];
	if (
		args.length > 1 ||
		(requested !== undefined && !isTapdDocumentKind(requested))
	) {
		ctx.ui.notify(
			"用法：/tapd preview [understanding|design|collaboration]",
			"warning",
		);
		return true;
	}
	await previewTapdDocument(pi, reviews, ctx, requested);
	return true;
}

export async function runTapdDocumentWorkflow(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	subcommand: string,
	additionalInstructions: string,
): Promise<{ handled: boolean; pending?: TapdDocumentSnapshot }> {
	const workflow = WORKFLOWS[subcommand];
	if (!workflow) return { handled: false };
	const before = await snapshotTapdDocument(ctx, workflow.kind);
	const started = await sendTapdWorkflowPrompt(
		pi,
		ctx,
		workflow.prompt,
		additionalInstructions,
	);
	return { handled: true, pending: started ? before : undefined };
}
