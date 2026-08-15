/**
 * Soft-load pi-lens from the companion npm install so Multi Task workers
 * keep diagnostics without bundling pi-lens into this toolkit.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { access } from "node:fs/promises";

async function resolvePiLensEntry() {
	const candidates = [
		join(homedir(), ".pi", "agent", "npm", "node_modules", "pi-lens", "dist", "index.js"),
		join(process.cwd(), ".pi", "npm", "node_modules", "pi-lens", "dist", "index.js"),
	];
	for (const path of candidates) {
		try {
			await access(path);
			return pathToFileURL(path).href;
		} catch {
			// try the next install location
		}
	}
	return undefined;
}

export default async function piLens(pi) {
	try {
		const href = await resolvePiLensEntry();
		if (!href) {
			console.warn(
				"[pi-lens] skipped — companion package not installed. Other toolkit extensions still load.",
			);
			return;
		}
		const mod = await import(href);
		const register = mod.default ?? mod;
		if (typeof register === "function") {
			return register(pi);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(
			`[pi-lens] skipped — package unavailable (${message}). Other toolkit extensions still load.`,
		);
	}
}
