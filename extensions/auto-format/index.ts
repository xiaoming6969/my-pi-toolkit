import type {
	AgentSettledEvent,
	ExtensionAPI,
	ExtensionContext,
	SessionStartEvent,
	ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { existsSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
	isEslintFile,
	isInside,
	resolvePackageBin,
	shouldFormat,
} from "./helpers.js";

function changedPath(event: ToolResultEvent, cwd: string): string | undefined {
	if (event.isError || (event.toolName !== "edit" && event.toolName !== "write")) {
		return undefined;
	}
	const path = event.input.path;
	if (typeof path !== "string") return undefined;
	const absolutePath = resolve(cwd, path);
	return isInside(cwd, absolutePath) && shouldFormat(absolutePath)
		? absolutePath
		: undefined;
}

function existingProjectFiles(cwd: string, paths: readonly string[]): string[] {
	const realRoot = realpathSync(cwd);
	const files: string[] = [];
	for (const path of paths) {
		try {
			const realPath = realpathSync(path);
			if (
				isInside(realRoot, realPath) &&
				shouldFormat(realPath) &&
				statSync(realPath).isFile()
			) {
				files.push(realPath);
			}
		} catch {
			// The file may have been removed later in the same agent run.
		}
	}
	return files;
}

function errorSummary(...outputs: string[]): string {
	const lines = outputs
		.flatMap((output) => output.split(/\r?\n/))
		.map((line) => line.trim())
		.filter(
			(line) =>
				line &&
				!line.startsWith("Browserslist: caniuse-lite") &&
				!line.startsWith("npx browserslist") &&
				!line.startsWith("npx update-browserslist-db") &&
				!line.startsWith("Why you should do it regularly"),
		);
	return lines[lines.length - 1]?.slice(0, 240) || "unknown error";
}

async function runFormatter(
	pi: ExtensionAPI,
	cwd: string,
	name: "ESLint" | "Prettier",
	script: string | undefined,
	args: string[],
): Promise<string | undefined> {
	if (!script || args.length === 0 || !existsSync(script)) return undefined;
	try {
		const result = await pi.exec(process.execPath, [script, ...args], { cwd });
		if (result.code === 0 || (name === "ESLint" && result.code === 1)) {
			return undefined;
		}
		return `${name}: ${errorSummary(result.stderr, result.stdout)}`;
	} catch (error) {
		return `${name}: ${errorSummary(error instanceof Error ? error.message : String(error))}`;
	}
}

async function formatFiles(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	paths: readonly string[],
): Promise<void> {
	const files = existingProjectFiles(ctx.cwd, paths);
	if (files.length === 0) return;

	const errors: string[] = [];
	const eslintFiles = files.filter(isEslintFile);
	const eslintError = await runFormatter(
		pi,
		ctx.cwd,
		"ESLint",
		eslintFiles.length > 0
			? resolvePackageBin(ctx.cwd, "eslint")
			: undefined,
		eslintFiles.length > 0 ? ["--fix", ...eslintFiles] : [],
	);
	if (eslintError) errors.push(eslintError);

	const prettierError = await runFormatter(
		pi,
		ctx.cwd,
		"Prettier",
		resolvePackageBin(ctx.cwd, "prettier"),
		["--write", "--ignore-unknown", ...files],
	);
	if (prettierError) errors.push(prettierError);

	if (errors.length > 0 && ctx.hasUI) {
		ctx.ui.notify(`Auto-format failed\n${errors.join("\n")}`, "warning");
	}
}

export default function autoFormat(pi: ExtensionAPI): void {
	const changedFiles = new Set<string>();

	pi.on(
		"session_start",
		(_event: SessionStartEvent, _ctx: ExtensionContext) => changedFiles.clear(),
	);

	pi.on("tool_result", (event: ToolResultEvent, ctx: ExtensionContext) => {
		if (!ctx.isProjectTrusted()) return;
		const path = changedPath(event, ctx.cwd);
		if (path) changedFiles.add(path);
	});

	pi.on(
		"agent_settled",
		async (_event: AgentSettledEvent, ctx: ExtensionContext) => {
			if (!ctx.isProjectTrusted() || changedFiles.size === 0) return;
			const pending = Array.from(changedFiles);
			changedFiles.clear();
			if (ctx.mode === "tui") {
				ctx.ui.setWorkingMessage("Formatting modified files...");
			}
			try {
				await formatFiles(pi, ctx, pending);
			} finally {
				if (ctx.mode === "tui") {
					ctx.ui.setWorkingMessage();
				}
			}
		},
	);

	pi.on("session_shutdown", () => changedFiles.clear());
}
