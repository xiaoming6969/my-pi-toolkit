import type { AutocompleteItem } from "@earendil-works/pi-tui";

const COMMANDS: AutocompleteItem[] = [
	{
		value: "bug",
		label: "bug",
		description: "根据会话已有缺陷描述定位代码原因",
	},
	{
		value: "bug-reject",
		label: "bug-reject",
		description: "拒绝当前关联 Bug（单页确认评价原因与解决方法）",
	},
	{
		value: "analyze",
		label: "analyze",
		description: "分析当前关联需求并生成理解文档",
	},
	{
		value: "design",
		label: "design",
		description: "基于已确认的需求理解生成设计方案",
	},
	{
		value: "collaboration",
		label: "collaboration",
		description: "生成供产品、后端和前端 Leader 评审的协作文档",
	},
	{
		value: "preview",
		label: "preview",
		description: "预览 understanding、design 或 collaboration 文档",
	},
	{
		value: "review",
		label: "review",
		description: "根据需求与设计方案审核代码及过度设计",
	},
	{
		value: "sub-task",
		label: "sub-task",
		description: "根据 design.md 创建设计和开发子需求",
	},
	{
		value: "git-status",
		label: "git-status",
		description: "查看 TAPD Git 工作流状态",
	},
	{ value: "branch", label: "branch", description: "创建 TAPD 关联分支" },
	{
		value: "commit",
		label: "commit",
		description: "提交并推送 TAPD 关联改动",
	},
	{ value: "mr", label: "mr", description: "创建或更新 MR 并回写 TAPD" },
];

const PREVIEW_DOCUMENTS: AutocompleteItem[] = [
	{
		value: "preview understanding",
		label: "understanding",
		description: "预览需求理解文档",
	},
	{
		value: "preview design",
		label: "design",
		description: "预览设计方案",
	},
	{
		value: "preview collaboration",
		label: "collaboration",
		description: "预览协作文档",
	},
];

export function tapdArgumentCompletions(
	prefix: string,
): AutocompleteItem[] | null {
	const normalized = prefix.trimStart();
	const items = normalized.startsWith("preview ")
		? PREVIEW_DOCUMENTS.filter((item) =>
				item.label.startsWith(normalized.slice("preview ".length)),
			)
		: COMMANDS.filter((item) => item.value.startsWith(normalized));
	return items.length > 0 ? items : null;
}
