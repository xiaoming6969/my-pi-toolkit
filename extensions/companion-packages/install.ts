import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { agentDir } from "./settings.js";

const TOOLKIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = resolve(TOOLKIT_ROOT, "scripts/install-companions.mjs");
const INSTALL_TIMEOUT_MS = 300_000;

export interface CompanionInstallResult {
	installed: string[];
	failed: Array<{ spec: string; error: string }>;
	skippedOffline: boolean;
}

function parseResult(stdout: string, stderr: string): CompanionInstallResult {
	const installed: string[] = [];
	const failed: Array<{ spec: string; error: string }> = [];
	let skippedOffline = false;
	for (const line of `${stdout}\n${stderr}`.split("\n")) {
		const text = line.trim();
		if (text === "SKIPPED_OFFLINE") skippedOffline = true;
		else if (text.startsWith("INSTALLED ")) installed.push(text.slice(10));
		else if (text.startsWith("FAILED ")) {
			const rest = text.slice(7);
			const space = rest.indexOf(" ");
			if (space === -1) failed.push({ spec: rest, error: "failed" });
			else
				failed.push({
					spec: rest.slice(0, space),
					error: rest.slice(space + 1),
				});
		}
	}
	return { installed, failed, skippedOffline };
}

export async function ensureCompanionPackages(
	pi: ExtensionAPI,
	cwd: string,
): Promise<CompanionInstallResult> {
	const result = await pi.exec(
		process.execPath,
		[SCRIPT, "--immediate", "--cwd", cwd],
		{
			timeout: INSTALL_TIMEOUT_MS,
			cwd: agentDir(),
		},
	);
	return parseResult(result.stdout, result.stderr);
}
