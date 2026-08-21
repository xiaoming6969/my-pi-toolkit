interface ModelRegistryLike {
	find(provider: string, modelId: string): { reasoning: boolean } | undefined;
}

/** Keep inherited thinking metadata only when the target model supports it. */
export function thinkingLevelForModel(
	model: string,
	thinkingLevel: string | undefined,
	registry: ModelRegistryLike,
): string | undefined {
	if (!thinkingLevel) return undefined;
	const separator = model.indexOf("/");
	if (separator < 1) return thinkingLevel;
	const resolved = registry.find(model.slice(0, separator), model.slice(separator + 1));
	return resolved?.reasoning === false ? undefined : thinkingLevel;
}
