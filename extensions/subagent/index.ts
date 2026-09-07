import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSubagentFollowupTool } from "./console/followup-tool.js";
import subagentConsole from "./console/index.js";
import repoSearchSubagent from "./repo-search/index.js";
import { registerBackgroundCompletionNotices } from "./spawn/complete-notice.js";
import { registerSubagentControlTools } from "./spawn/control-tools.js";
import { registerSpawnSubagentTool } from "./spawn/tool.js";

export default function subagent(pi: ExtensionAPI): void {
	repoSearchSubagent(pi);
	registerBackgroundCompletionNotices(pi);
	registerSpawnSubagentTool(pi);
	registerSubagentControlTools(pi);
	registerSubagentFollowupTool(pi);
	subagentConsole(pi);
}
