import { spawn, execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

export const EXTRA_FLUSH_MS = 400;
export const FALLBACK_WAIT_MS = 5_000;

export function sleep(ms) {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export function isPidAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error && error.code === "EPERM";
	}
}

function processInfo(pid) {
	try {
		const out = execFileSync("ps", ["-o", "ppid=,args=", "-p", String(pid)], {
			encoding: "utf8",
		}).trim();
		const match = out.match(/^\s*(\d+)\s+(.*)$/s);
		if (!match) return undefined;
		return { ppid: Number(match[1]), args: match[2] };
	} catch {
		return undefined;
	}
}

function isPiCommand(args) {
	if (!args || args.includes("install-companions")) return false;
	return (
		args.includes("pi-coding-agent") ||
		args.includes("package-manager-cli") ||
		/(?:^|[\s/\\])pi(?:\s|$)/.test(args)
	);
}

export function findAncestorPiPid() {
	let pid = process.ppid;
	for (let i = 0; i < 16 && pid > 1; i++) {
		const info = processInfo(pid);
		if (!info) break;
		if (isPiCommand(info.args)) return pid;
		pid = info.ppid;
	}
	return undefined;
}

export function isManagedPiPackageCwd(cwd, agentRoot) {
	const root = resolve(agentRoot);
	const resolved = resolve(cwd);
	return (
		resolved === join(root, "git") ||
		resolved.startsWith(`${join(root, "git")}/`) ||
		resolved === join(root, "npm") ||
		resolved.startsWith(`${join(root, "npm")}/`)
	);
}

export function spawnDeferred(scriptPath, args, cwd) {
	const child = spawn(process.execPath, [scriptPath, ...args], {
		detached: true,
		stdio: "ignore",
		env: process.env,
		cwd,
	});
	child.unref();
}

export async function waitForOuterInstall(options) {
	if (Number.isFinite(options.waitPid) && options.waitPid > 0) {
		while (isPidAlive(options.waitPid)) await sleep(250);
	} else if (Number.isFinite(options.waitMs) && options.waitMs > 0) {
		await sleep(options.waitMs);
	}
	await sleep(EXTRA_FLUSH_MS);
}
