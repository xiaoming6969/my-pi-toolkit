#!/usr/bin/env node
/**
 * Install unpinned companion Pi packages (ponytail, pi-lens).
 *
 * npm postinstall of this toolkit runs this so `pi install git|npm:...`
 * registers the companions. Nested installs defer until the outer Pi
 * process exits, otherwise SettingsManager overwrites settings.json.
 *
 * session_start calls this with --immediate (local `pi install .` has
 * no npm lifecycle).
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	FALLBACK_WAIT_MS,
	findAncestorPiPid,
	isManagedPiPackageCwd,
	spawnDeferred,
	waitForOuterInstall,
} from "./companion-install-wait.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const TOOLKIT_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const INSTALL_TIMEOUT_MS = 300_000;

/** @typedef {{ spec: string, name: string, listName: string }} CompanionPkg */

/** @type {CompanionPkg[]} */
const COMPANION_NPM_PACKAGES = JSON.parse(
	readFileSync(
		join(TOOLKIT_ROOT, "extensions/companion-packages/catalog.json"),
		"utf8",
	),
);

function agentDir() {
	return join(homedir(), ".pi", "agent");
}

function isOffline() {
	const value = process.env.PI_OFFLINE;
	if (!value) return false;
	const normalized = value.trim().toLowerCase();
	return normalized !== "0" && normalized !== "false" && normalized !== "off";
}

function npmNameFromSource(source) {
	if (!source.startsWith("npm:")) return undefined;
	const spec = source.slice("npm:".length);
	if (spec.startsWith("@")) {
		const match = spec.match(/^(@[^/]+\/[^@]+)(?:@.+)?$/);
		return match?.[1];
	}
	const name = spec.split("@")[0];
	return name || undefined;
}

function readPackageSources(path) {
	try {
		const settings = JSON.parse(readFileSync(path, "utf8"));
		const sources = [];
		for (const entry of settings.packages ?? []) {
			const source = typeof entry === "string" ? entry : entry?.source;
			if (typeof source === "string") sources.push(source);
		}
		return sources;
	} catch {
		return [];
	}
}

function configuredCompanionNames(cwd) {
	const names = new Set();
	for (const source of [
		...readPackageSources(join(agentDir(), "settings.json")),
		...readPackageSources(join(cwd, ".pi", "settings.json")),
	]) {
		const name = npmNameFromSource(source);
		if (name) names.add(name);
	}
	return names;
}

function parseArgs(argv) {
	const options = {
		immediate: false,
		waitPid: undefined,
		waitMs: undefined,
		cwd: process.env.PI_COMPANION_CWD || process.cwd(),
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--immediate") options.immediate = true;
		else if (arg === "--wait-pid") options.waitPid = Number(argv[++i]);
		else if (arg === "--wait-ms") options.waitMs = Number(argv[++i]);
		else if (arg === "--cwd") options.cwd = argv[++i];
	}
	return options;
}

function shouldDefer(options) {
	if (options.immediate || options.waitPid || options.waitMs) return false;
	return (
		process.env.npm_lifecycle_event === "postinstall" &&
		isManagedPiPackageCwd(process.cwd(), agentDir())
	);
}

function runCommand(command, args, cwd) {
	return new Promise((resolveRun) => {
		const child = spawn(command, args, {
			cwd,
			env: process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => child.kill("SIGTERM"), INSTALL_TIMEOUT_MS);
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			resolveRun({ code: 127, stdout, stderr: error.message });
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolveRun({ code: code ?? 1, stdout, stderr });
		});
	});
}

function summarizeError(stderr, stdout, code) {
	const text = `${stderr}\n${stdout}`.trim() || `exit ${code}`;
	const line =
		text
			.split("\n")
			.map((entry) => entry.trim())
			.find((entry) => entry.length > 0) ?? text;
	return line.slice(0, 200);
}

async function commandExists(command) {
	try {
		await access(command);
		return true;
	} catch {
		return false;
	}
}

async function runPiInstall(spec) {
	const attempts = ["pi", join(TOOLKIT_ROOT, "node_modules", ".bin", "pi")];
	let lastError = "pi 不可用";
	for (const command of attempts) {
		if (command !== "pi" && !(await commandExists(command))) continue;
		const result = await runCommand(command, ["install", spec], agentDir());
		if (result.code === 0) return undefined;
		lastError = summarizeError(result.stderr, result.stdout, result.code);
		if (result.code !== 127) return lastError;
	}
	return lastError;
}

function printResult(result) {
	if (result.deferred) {
		console.log(
			`RESULT installed= failed=0 skippedOffline=false deferred=true`,
		);
		return;
	}
	if (result.skippedOffline) console.log("SKIPPED_OFFLINE");
	for (const name of result.installed) console.log(`INSTALLED ${name}`);
	for (const item of result.failed) {
		console.log(`FAILED ${item.spec} ${item.error}`);
	}
	console.log(
		`RESULT installed=${result.installed.join(",")} failed=${result.failed.length} skippedOffline=${result.skippedOffline} deferred=false`,
	);
}

async function installCompanions(cwd) {
	const configured = configuredCompanionNames(cwd);
	const missing = COMPANION_NPM_PACKAGES.filter(
		(pkg) => !configured.has(pkg.name),
	);
	if (missing.length === 0) {
		return { installed: [], failed: [], skippedOffline: false, deferred: false };
	}
	if (isOffline()) {
		return { installed: [], failed: [], skippedOffline: true, deferred: false };
	}
	const installed = [];
	const failed = [];
	for (const pkg of missing) {
		const error = await runPiInstall(pkg.spec);
		if (error) failed.push({ spec: pkg.spec, error });
		else installed.push(pkg.listName);
	}
	return { installed, failed, skippedOffline: false, deferred: false };
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (shouldDefer(options)) {
		const piPid = findAncestorPiPid();
		const waitArgs = piPid
			? ["--wait-pid", String(piPid), "--cwd", process.cwd()]
			: ["--wait-ms", String(FALLBACK_WAIT_MS), "--cwd", process.cwd()];
		spawnDeferred(SCRIPT_PATH, waitArgs, agentDir());
		console.log(
			`DEFERRED ${piPid ? `wait-pid=${piPid}` : `wait-ms=${FALLBACK_WAIT_MS}`}`,
		);
		printResult({
			installed: [],
			failed: [],
			skippedOffline: false,
			deferred: true,
		});
		return;
	}
	if (options.waitPid || options.waitMs) await waitForOuterInstall(options);
	printResult(await installCompanions(options.cwd));
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`FAILED companion-install ${message}`);
	console.log("RESULT installed= failed=1 skippedOffline=false deferred=false");
	process.exit(0);
});
