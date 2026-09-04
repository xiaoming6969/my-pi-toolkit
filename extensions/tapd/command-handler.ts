import type {
	ExtensionAPI,
	ExtensionCommandContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { BrowserReviewManager } from "../browser-review/server.js";
import { loadConfig } from "./core/config.js";
import type { TapdDocumentSnapshot } from "./documents/preview.js";
import type { WorkingCancel } from "./working.js";

const STATE_KEY = "tapd-view-state";
const GIT_COMMANDS = new Set(["git-status", "branch", "commit", "mr"]);

export async function handleTapdCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: ExtensionCommandContext,
	reviews: BrowserReviewManager,
	setPendingPreview: (preview: TapdDocumentSnapshot | undefined) => void,
	working?: WorkingCancel,
): Promise<void> {
	const trimmedArgs = args.trim();
	const [sub = "", ...restArgs] = trimmedArgs.split(/\s+/);
	const additionalInstructions = restArgs.join(" ").trim();

	if (sub === "preview") {
		const { handleTapdPreviewCommand } = await import("./documents/commands.js");
		working?.dispose();
		await handleTapdPreviewCommand(pi, reviews, ctx, sub, restArgs);
		return;
	}

	const config = loadConfig();
	if (!config) {
		ctx.ui.notify(
			'请先配置 ~/.pi/agent/tapd.json:\n{ "token": "你的TAPD个人令牌" }',
			"error",
		);
		return;
	}

	if (GIT_COMMANDS.has(sub)) {
		const { runTapdGitCommand } = await import("./git/commands.js");
		await runTapdGitCommand(pi, sub, restArgs, ctx, config, working);
		return;
	}
	if (sub === "bug") {
		const { locateTapdBug } = await import("./documents/workflows.js");
		working?.dispose();
		await locateTapdBug(pi, ctx);
		return;
	}
	if (sub === "bug-reject") {
		const { rejectTapdBug } = await import("./documents/bug-reject.js");
		working?.dispose();
		await rejectTapdBug(pi, ctx, config);
		return;
	}
	if (sub === "analyze" || sub === "design" || sub === "collaboration") {
		const { runTapdDocumentWorkflow } = await import("./documents/commands.js");
		working?.dispose();
		const documentWorkflow = await runTapdDocumentWorkflow(
			pi,
			ctx,
			sub,
			additionalInstructions,
		);
		if (documentWorkflow.handled) setPendingPreview(documentWorkflow.pending);
		return;
	}
	if (sub === "review") {
		const { requestTapdReview } = await import("./review/command.js");
		working?.suspend();
		await requestTapdReview(pi, ctx, restArgs);
		return;
	}
	if (sub === "sub-task") {
		const { createSubtasks } = await import("./subtasks/sync.js");
		working?.dispose();
		await createSubtasks(pi, ctx, config);
		return;
	}

	let curOnly = true;
	const entries = ctx.sessionManager.getEntries();
	const stateEntry = entries
		.filter(
			(entry: SessionEntry) =>
				entry.type === "custom" && entry.customType === STATE_KEY,
		)
		.at(-1);
	if (stateEntry?.type === "custom") {
		const data = stateEntry.data as { currentOnly?: unknown } | undefined;
		if (typeof data?.currentOnly === "boolean") curOnly = data.currentOnly;
	}

	const { openTapdTodoList } = await import("./todo/open.js");
	const outcome = await openTapdTodoList(ctx, config, curOnly, working);
	if (!outcome) return;
	if (outcome.kind === "session_action") {
		const { action, itemKey, itemName } = outcome;
		const { createTapdSession } = await import("./sessions/create.js");
		working?.dispose();
		try {
			if (action.type === "switch") {
				await ctx.switchSession(action.sessionFile);
			} else {
				await createTapdSession(ctx, config, itemKey, itemName, action.draft);
			}
		} catch {
			// 会话可能已替换，勿再使用旧 ctx
		}
		return;
	}
	if (outcome.saveState) pi.appendEntry(STATE_KEY, { currentOnly: curOnly });
}
