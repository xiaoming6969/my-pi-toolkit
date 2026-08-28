import type { TapdReviewScope, TapdReviewTarget } from "./types.js";

export function buildReviewDelegationMessage(options: {
	target: TapdReviewTarget;
	scope: TapdReviewScope;
	baseRef: string;
	instructions?: string;
}): string {
	const range =
		options.scope === "uncommitted"
			? "仅审核未提交修改（暂存、未暂存和未跟踪；不要包含只存在于既有 commit 中的改动）"
			: `审核当前分支相对 ${options.baseRef} 的全部修改（含已提交、暂存、未暂存和未跟踪）`;
	return [
		"请立即调用 subagent 工具，使用 agent 为 reviewer、context 为 fresh，审核当前 TAPD 需求的代码修改。",
		"不要自己审代码来替代 reviewer，也不要在 reviewer 返回后自动修改代码。",
		"reviewer 没有 bash：请先在本会话用 git 列出变更文件和 diff，再把这些信息写入 reviewer 的 task。",
		"",
		`TAPD 需求：${options.target.storyId} ${options.target.storyName}`,
		`需求理解：${options.target.understandingFile}`,
		`技术设计：${options.target.designFile}`,
		`审核范围：${range}`,
		options.instructions ? `补充要求：${options.instructions}` : "",
		"",
		"task 必须包含上述文档路径、范围、变更文件或 diff，并要求 reviewer：",
		"- 对照 understanding.md 与 design.md 审需求满足度、设计满足度、隐藏 bug 和过度设计",
		"- 只读检查，不要修改文件",
		"- 返回分级发现",
		"",
		"reviewer 返回后，总结最高等级问题并等待我确认。",
	]
		.filter((line) => line !== "")
		.join("\n");
}
