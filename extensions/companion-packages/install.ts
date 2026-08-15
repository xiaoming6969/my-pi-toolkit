import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { COMPANION_NPM_PACKAGES } from "./catalog.js";
import { agentDir, configuredCompanionNames } from "./settings.js";

const TOOLKIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const INSTALL_TIMEOUT_MS = 300_000;

export interface CompanionInstallResult {
	installed: string[];
	failed: Array<{ spec: string; error: string }>;
	skippedOffline: boolean;
}

function isOffline(): boolean {
	const value = process.env.PI_OFFLINE;
	if (!value) return false;
	const normalized = value.trim().toLowerCase();
	return normalized !== "0" && normalized !== "false" && normalized !== "off";
}

function summarizeError(stderr: string, stdout: string, code: number): string {
	const text = `${stderr}\n${stdout}`.trim() || `exit ${code}`;
	const line =
		text
			.split("\n")
			.map((entry) => entry.trim())
			.find((entry) => entry.length > 0) ?? text;
	return line.slice(0, 200);
}

async function runPiInstall(
	pi: ExtensionAPI,
	spec: string,
): Promise<string | undefined> {
	const attempts = ["pi", resolve(TOOLKIT_ROOT, "node_modules", ".bin", "pi")];
	let lastError = "pi 不可用";
	for (const command of attempts) {
		const result = await pi.exec(command, ["install", spec], {
			timeout: INSTALL_TIMEOUT_MS,
			cwd: agentDir(),
		});
		if (result.code === 0) return undefined;
		lastError = summarizeError(result.stderr, result.stdout, result.code);
		if (result.code !== 127) return lastError;
	}
	return lastError;
}

export async function ensureCompanionPackages(
	pi: ExtensionAPI,
	cwd: string,
): Promise<CompanionInstallResult> {
	const configured = await configuredCompanionNames(cwd);
	const missing = COMPANION_NPM_PACKAGES.filter(
		(pkg) => !configured.has(pkg.name),
	);
	if (missing.length === 0) {
		return { installed: [], failed: [], skippedOffline: false };
	}
	if (isOffline()) {
		return { installed: [], failed: [], skippedOffline: true };
	}

	const installed: string[] = [];
	const failed: Array<{ spec: string; error: string }> = [];
	for (const pkg of missing) {
		const error = await runPiInstall(pi, pkg.spec);
		if (error) failed.push({ spec: pkg.spec, error });
		else installed.push(pkg.listName);
	}
	return { installed, failed, skippedOffline: false };
}
