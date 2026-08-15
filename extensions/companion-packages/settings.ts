import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { COMPANION_NPM_PACKAGES, npmNameFromSource } from "./catalog.js";

type PackageEntry = string | { source?: unknown };

interface PiSettings {
	packages?: PackageEntry[];
}

export function agentDir(): string {
	return join(homedir(), ".pi", "agent");
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function readPackages(path: string): Promise<string[]> {
	try {
		const settings = JSON.parse(await readFile(path, "utf8")) as PiSettings;
		const names: string[] = [];
		for (const entry of settings.packages ?? []) {
			const source = typeof entry === "string" ? entry : entry?.source;
			if (typeof source !== "string") continue;
			const name = npmNameFromSource(source);
			if (name) names.push(name);
		}
		return names;
	} catch {
		return [];
	}
}

export async function configuredCompanionNames(cwd: string): Promise<Set<string>> {
	const names = new Set<string>([
		...(await readPackages(join(agentDir(), "settings.json"))),
		...(await readPackages(join(cwd, ".pi", "settings.json"))),
	]);
	return names;
}

export async function companionExtensionNames(cwd: string): Promise<string[]> {
	const configured = await configuredCompanionNames(cwd);
	return COMPANION_NPM_PACKAGES.filter((pkg) => configured.has(pkg.name)).map(
		(pkg) => pkg.listName,
	);
}

export async function companionSkillDirectories(cwd: string): Promise<string[]> {
	const configured = await configuredCompanionNames(cwd);
	const roots = [
		join(agentDir(), "npm", "node_modules"),
		join(cwd, ".pi", "npm", "node_modules"),
	];
	const directories: string[] = [];
	for (const pkg of COMPANION_NPM_PACKAGES) {
		if (!configured.has(pkg.name)) continue;
		for (const root of roots) {
			const skills = join(root, pkg.name, "skills");
			if (await exists(skills)) directories.push(skills);
		}
	}
	return directories;
}
