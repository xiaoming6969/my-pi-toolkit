import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSubagentFollowupTool } from "./console/followup-tool.js";
import subagentConsole from "./console/index.js";
import repoSearchSubagent from "./repo-search/index.js";

export default function subagent(pi: ExtensionAPI): void {
	repoSearchSubagent(pi);
	registerSubagentFollowupTool(pi);
	subagentConsole(pi);
}
