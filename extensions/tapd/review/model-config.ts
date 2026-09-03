import type { TapdConfig } from "../types.js";

const THINKING_LEVELS = new Set([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

export function resolveReviewModel(
	config: TapdConfig,
	currentModel: { provider: string; id: string } | undefined,
): string {
	const configured = config.review?.model;
	if (configured !== undefined) {
		if (typeof configured !== "string" || !configured.trim())
			throw new Error("tapd.json 中 review.model 必须是非空模型名称");
		return configured.trim();
	}
	if (!currentModel)
		throw new Error(
			"未配置 Review 子代理模型，且主 Agent 当前没有可继承的模型",
		);
	return `${currentModel.provider}/${currentModel.id}`;
}

export function resolveReviewThinkingLevel(
	config: TapdConfig,
	currentThinkingLevel: string | undefined,
): string | undefined {
	const configured = config.review?.thinkingLevel;
	if (configured === undefined) return currentThinkingLevel;
	if (typeof configured !== "string" || !THINKING_LEVELS.has(configured))
		throw new Error(
			"tapd.json 中 review.thinkingLevel 必须是 off、minimal、low、medium、high、xhigh 或 max",
		);
	return configured;
}
