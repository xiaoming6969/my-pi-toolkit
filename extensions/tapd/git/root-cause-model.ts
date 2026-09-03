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

export function resolveRootCauseModel(
	config: TapdConfig,
	currentModel: { provider: string; id: string } | undefined,
): string {
	const configured = config.rootCause?.model;
	if (configured !== undefined) {
		if (typeof configured !== "string" || !configured.trim())
			throw new Error("tapd.json 中 rootCause.model 必须是非空模型名称");
		return configured.trim();
	}
	if (!currentModel)
		throw new Error(
			"未配置根因总结子代理模型，且主 Agent 当前没有可继承的模型",
		);
	return `${currentModel.provider}/${currentModel.id}`;
}

export function resolveRootCauseThinkingLevel(
	config: TapdConfig,
	currentThinkingLevel: string | undefined,
): string | undefined {
	const configured = config.rootCause?.thinkingLevel;
	if (configured === undefined) return currentThinkingLevel;
	if (typeof configured !== "string" || !THINKING_LEVELS.has(configured))
		throw new Error(
			"tapd.json 中 rootCause.thinkingLevel 必须是 off、minimal、low、medium、high、xhigh 或 max",
		);
	return configured;
}
