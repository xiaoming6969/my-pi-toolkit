const SHELL_META = /[\r\n;&|<>`$\\'"(){}[\]*#]/;
const GIT_QUERY_COMMANDS = new Set([
	"status",
	"diff",
	"log",
	"show",
	"grep",
	"ls-files",
	"branch",
	"remote",
]);
const GIT_EXTERNAL_OPTIONS = [
	"--output",
	"--ext-diff",
	"--textconv",
	"--config",
	"--exec",
	"--paginate",
	"--open-files-in-pager",
];

export function isAskBashTool(
	name: string,
	mode: "ask" | "plan",
): boolean {
	return mode === "ask" && name === "bash";
}

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

function allowCurl(args: string[]): boolean {
	let urls = 0;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index] ?? "";
		if (isHttpUrl(arg)) {
			urls += 1;
			continue;
		}
		if (/^-[fsSLI]+$/.test(arg)) continue;
		if (
			[
				"--fail",
				"--fail-with-body",
				"--silent",
				"--show-error",
				"--location",
				"--head",
				"--compressed",
			].includes(arg)
		) continue;
		if (["--max-time", "--connect-timeout", "--retry"].includes(arg)) {
			const value = args[++index];
			if (!value || !/^\d+$/.test(value)) return false;
			continue;
		}
		return false;
	}
	return urls === 1;
}

function allowDefuddle(args: string[]): boolean {
	if (args[0] !== "parse" || !isHttpUrl(args[1] ?? "")) return false;
	if (args.length === 2) return true;
	if (args.length === 3) return args[2] === "--md";
	return (
		args.length === 4 &&
		args[2] === "-p" &&
		["title", "description", "domain"].includes(args[3] ?? "")
	);
}

function allowGit(args: string[]): boolean {
	const subcommand = args[0] ?? "";
	if (!GIT_QUERY_COMMANDS.has(subcommand)) return false;
	const options = args.slice(1);
	if (
		options.some(
			(arg) =>
				arg === "-c" ||
				arg === "-O" ||
				GIT_EXTERNAL_OPTIONS.some(
					(option) => arg === option || arg.startsWith(`${option}=`),
				),
		)
	) return false;
	if (subcommand === "branch") {
		return options.every(
			(arg) =>
				["--show-current", "--list", "-a", "-r", "-v", "-vv"].includes(arg) ||
				arg.startsWith("--contains="),
		);
	}
	if (subcommand === "remote") {
		return options.length === 0 || (options.length === 1 && options[0] === "-v");
	}
	return true;
}

function allowGh(args: string[]): boolean {
	return (
		["release", "repo", "issue", "pr"].includes(args[0] ?? "") &&
		["view", "list"].includes(args[1] ?? "") &&
		!args.slice(2).some((arg) => arg === "--web")
	);
}

const QUERY_VALIDATORS: Record<string, (args: string[]) => boolean> = {
	curl: allowCurl,
	defuddle: allowDefuddle,
	git: allowGit,
	gh: allowGh,
	npm: (args) => ["view", "info", "search"].includes(args[0] ?? ""),
	pnpm: (args) => ["view", "info"].includes(args[0] ?? ""),
};

export function checkAskBashCommand(command: unknown): string | undefined {
	if (typeof command !== "string" || !command.trim()) {
		return "Ask mode blocked bash because no command was provided.";
	}
	if (SHELL_META.test(command)) {
		return "Ask mode bash allows one simple query command without shell operators, quoting, expansion, or redirection.";
	}
	const [executable = "", ...args] = command.trim().split(/\s+/);
	return QUERY_VALIDATORS[executable]?.(args)
		? undefined
		: `Ask mode blocked bash command "${executable || "unknown"}" because it is not an approved read-only query. Press Shift+Tab to switch to Build mode.`;
}
