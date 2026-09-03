import {
	listBackgroundSubagents,
	subscribeBackgroundSubagents,
} from "../shared/subagent/background.js";
import {
	listLiveSubagents,
	subscribeSubagentRegistry,
} from "../shared/subagent/registry.js";

/**
 * Observe both subagent stores and report ids that have finished successfully.
 * Background jobs count once they settle as completed; live managed runs count
 * once their status becomes completed (a later follow-up does not un-complete).
 */
export function collectCompletedSubagentIds(): Set<string> {
	const ids = new Set<string>();
	for (const job of listBackgroundSubagents())
		if (job.status === "completed") ids.add(job.id);
	for (const run of listLiveSubagents())
		if (run.status === "completed") ids.add(run.id);
	return ids;
}

export function subscribeCompletedSubagents(
	listener: (completedIds: Set<string>) => void,
): () => void {
	const notify = () => listener(collectCompletedSubagentIds());
	const unsubscribeBackground = subscribeBackgroundSubagents(notify);
	const unsubscribeRegistry = subscribeSubagentRegistry(notify);
	return () => {
		unsubscribeBackground();
		unsubscribeRegistry();
	};
}
