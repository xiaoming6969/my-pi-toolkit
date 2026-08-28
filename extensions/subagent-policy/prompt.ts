const SUBAGENT_TOOL_NAME = "subagent";

export const SUBAGENT_POLICY_PROMPT = `## 子代理（pi-subagents）

当前会话有 \`subagent\` 工具。下列情形**必须先委派 \`scout\`**，不要自己先全仓 grep：

- 影响面与调用链问题：「改 X 会影响哪些地方」「谁在用 X」「牵连哪些模块」。
- 本会话还没读过该模块，且需要跨目录定位入口、数据流或约定。
- 规划、设计或大范围修改前的摸底。
- 预计要 3 次以上 grep/read 才能定位。

只有目标文件已明确、或本会话已读过相关代码、一两次 grep/read 就能收尾时，才自己查。用户给出符号名**不等于**路径已知：知道标识符不等于知道影响面。

仓库级提示（如项目 \`AGENTS.md\`）只补充必读文档和审查重点，不解除本节的委派要求。两者同时适用时先 scout，再按仓库提示补读指定文档。

按角色选择 agent 名称：
- scout：陌生代码的入口、关键文件、数据流与影响面。
- reviewer：非平凡改动完成后的独立审核。返回后只总结问题，不要自动改代码，除非用户要求修复。
- worker：需要隔离实现时。同一工作区同时只保持一个写者。
- researcher：外部资料与生态。第三方库、SDK、官方文档用 Context7，不要用 scout 或 researcher 代替。
- oracle：高风险方案，用来挑战假设，不改代码。

一次只委派一个子代理时用 { agent, task }。多步或并行用一次 workflowScript。用户已点名某个角色时，优先用该角色。`.trim();

export function appendSubagentPolicy(
	systemPrompt: string,
	toolNames: readonly string[],
): string | undefined {
	if (!toolNames.includes(SUBAGENT_TOOL_NAME)) return undefined;
	return `${systemPrompt}\n\n${SUBAGENT_POLICY_PROMPT}`;
}
