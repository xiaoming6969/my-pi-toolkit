/**
 * Soft-load bundled @dietrichgebert/ponytail so toolkit startup survives if
 * the package is missing from node_modules.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function ponytail(pi: ExtensionAPI): Promise<void> {
	try {
		const mod = await import(
			"../../node_modules/@dietrichgebert/ponytail/pi-extension/index.js"
		);
		const register = mod.default ?? mod;
		if (typeof register === "function") {
			await register(pi);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(
			`[ponytail] skipped — package unavailable (${message}). Other toolkit extensions still load.`,
		);
	}
}
