function stripTerminalControls(value: string): string {
	return value
		.replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g, "")
		.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

export function isReproductionStepsLine(value: string): boolean {
	try {
		return (JSON.parse(value) as { type?: unknown }).type === "reproduction_steps";
	} catch {
		return false;
	}
}

export function latestReproductionStepsLine(text: string): string | undefined {
	return text
		.split(/\r?\n/)
		.filter(Boolean)
		.reverse()
		.find(isReproductionStepsLine);
}

export function formatDebugLogLines(value: string): string[] {
	const clean = stripTerminalControls(value);
	try {
		const record = JSON.parse(clean) as { type?: unknown; steps?: unknown };
		if (
			record.type === "reproduction_steps" &&
			Array.isArray(record.steps) &&
			record.steps.every((step) => typeof step === "string")
		) {
			return [
				"复现步骤",
				...record.steps.map((step, index) => `${index + 1}. ${step}`),
			];
		}
	} catch {
		// Non-JSON runtime logs are displayed as-is.
	}
	return [clean];
}
