/**
 * ming-core — 编排本 toolkit 的通用能力扩展。
 *
 * tapd / context7 仍为独立入口。子 Agent 使用瘦加载路径，勿改为指向本入口。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import agentTodos from "../agent-todos/index.js";
import autoFormat from "../auto-format/index.js";
import browserReview from "../browser-review/index.js";
import builtInToolStyle from "../built-in-tool-style/index.js";
import chatMode from "../chat-mode/index.js";
import helps from "../helps/index.js";
import modelManager from "../model-manager/index.js";
import multiTask from "../multi-task/index.js";
import openaiCompatModels from "../openai-compat-models/index.js";
import repoSearchSubagent from "../repo-search-subagent/index.js";
import startupDashboard from "../startup-dashboard/index.js";
import { registerSubagentFollowupTool } from "../subagent-console/followup-tool.js";
import subagentConsole from "../subagent-console/index.js";
import taskDuration from "../task-duration/index.js";
import worktree from "./worktree/index.js";

export default function mingCore(pi: ExtensionAPI): void {
	openaiCompatModels(pi);
	modelManager(pi);
	browserReview(pi);
	chatMode(pi);
	builtInToolStyle(pi);
	autoFormat(pi);
	agentTodos(pi);
	multiTask(pi);
	repoSearchSubagent(pi);
	registerSubagentFollowupTool(pi);
	subagentConsole(pi);
	taskDuration(pi);
	worktree(pi);
	startupDashboard(pi);
	helps(pi);
}
