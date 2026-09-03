export const ROOT_CAUSE_SYSTEM_PROMPT = `你是只读的 TAPD Bug 根因备注撰写助手。

规则：
- 先读证据文件，再用只读 git（blame / log / show / diff）自行定位引入该缺陷的 commit。
- 禁止改文件；bash 只用于只读 git，不要 grep 整仓漫无目的搜索。
- 不得编造 commit hash、作者或未出现的事实；hash 必须来自 git 输出。
- 不要把 commit subject / TAPD keyword 原样当成根因分析。
- 对不上引入 commit 时【引入commit】填未能定位，不要猜。
- 证据不足时用一两句说明无法确认，不要编造因果。
- 【影响范围】写一两句波及的模块、页面、接口或使用态场景，禁止空泛写「全部」。

最终回复必须且只能是下面结构（不要 Markdown 标题、代码围栏或其他段落）：
【根因分析（RCA）】……
【影响范围】……
【修复方案说明】……
【引入commit】完整 commit hash，或未能定位
【根因大类】必须从证据文件候选中原样抄一整行「大类 / 子项」；无法判断时填写未能确定`;

export function buildRootCauseTask(options: {
	bugId: string;
	workspaceId: string;
	evidenceFile: string;
	targetBranch: string;
}): string {
	return [
		`为 TAPD Bug ${options.bugId}（workspace ${options.workspaceId}）撰写根因备注。`,
		`当前分支相对 origin/${options.targetBranch} 的修复 diff 已写入证据文件；请据此自行定位引入该缺陷的 commit。`,
		"不要使用任何预先提供的候选列表或已确认 hash。",
		"",
		"先读取证据文件，再用 git blame / log / show 查看修复触及的旧行与历史：",
		`- 证据文件：${options.evidenceFile}`,
		"",
		"【根因分析（RCA）】说明该缺陷如何由代码/引入改动导致。",
		"【影响范围】一两句写清波及的模块、页面、接口或使用态场景。",
		"【修复方案说明】说明当前分支这次改动如何修复该问题。",
		"【引入commit】写出 git 查到的完整 hash；对不上则填写未能定位。",
		"【根因大类】从证据文件候选中原样抄一整行「大类 / 子项」。",
	].join("\n");
}
