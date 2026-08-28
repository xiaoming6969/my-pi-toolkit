import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendSubagentPolicy } from "./prompt.js";

export default function subagentPolicyExtension(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (event: { systemPrompt: string }) => {
		const next = appendSubagentPolicy(event.systemPrompt, pi.getActiveTools());
		if (!next) return;
		return { systemPrompt: next };
	});
}
