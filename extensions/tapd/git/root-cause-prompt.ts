export const ROOT_CAUSE_SYSTEM_PROMPT = `你是只读的 TAPD Bug 根因备注撰写助手。

规则：
- 只读一次证据文件，然后立刻输出；禁止 grep、find、ls，禁止再搜索或翻阅仓库。
- 证据文件已包含缺陷描述、会话定位结论和 Git diff，足够撰写备注。
- 不得编造 commit hash、作者或未出现的事实。
- 不要把 commit subject / TAPD keyword 原样当成产生原因。
- 证据不足时用一两句说明无法确认，不要编造因果。

最终回复必须且只能是下面结构（不要 Markdown 标题、代码围栏或其他段落）：
【产生原因】……
【修复】……
【根因大类】必须从证据文件候选中原样抄一整行「大类 / 子项」；无法判断时填写未能确定`;

export function buildRootCauseTask(options: {
	bugId: string;
	workspaceId: string;
	evidenceFile: string;
	introducedCommit?: string;
}): string {
	const introduced = options.introducedCommit
		? `已确认的引入 commit：${options.introducedCommit}`
		: "未能定位引入 commit；请主要依据缺陷描述和当前修复 diff 总结。";
	return [
		`为 TAPD Bug ${options.bugId}（workspace ${options.workspaceId}）撰写根因备注。`,
		introduced,
		"",
		"只读取下面这份证据文件一次，不要再查看仓库其它文件：",
		`- 证据文件：${options.evidenceFile}`,
		"",
		"【产生原因】说明该缺陷如何由代码/引入改动导致。",
		"【修复】说明当前分支这次改动如何修复该问题。",
		"【根因大类】从证据文件候选中原样抄一整行「大类 / 子项」。",
	].join("\n");
}

export function buildRootCauseDelegationMessage(task: string): string {
	return [
		"请立即调用 subagent 工具，使用 agent 为 reviewer、context 为 fresh，根据证据文件撰写 TAPD Bug 根因备注。",
		"不要自己搜索仓库。若没有 subagent 工具，你必须自己只读取证据文件一次，然后立刻输出。",
		"不要创建或更新 MR，不要修改代码。",
		"",
		ROOT_CAUSE_SYSTEM_PROMPT,
		"",
		task,
		"",
		"reviewer 返回后，把三段原文作为你的整段回复（不要总结、不要加标题）。",
	].join("\n");
}
