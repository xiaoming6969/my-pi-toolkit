import { existsSync } from "node:fs";
import { basename } from "node:path";

export interface PiInvocation {
	command: string;
	args: string[];
}

export interface PiInvocationHost {
	/** `process.argv[1]`: the running Pi entry script, if any. */
	entryScript?: string;
	/** `process.execPath`: node/bun, or a compiled Pi binary. */
	execPath: string;
}

/**
 * Resolve how to launch a child Pi process with the same runtime as the
 * parent: re-run the parent's entry script, fall back to `pi` on PATH when
 * running under node/bun, or re-exec the compiled binary itself.
 */
export function getPiInvocation(
	args: readonly string[] = [],
	host: PiInvocationHost = {
		entryScript: process.argv[1],
		execPath: process.execPath,
	},
): PiInvocation {
	const script = host.entryScript;
	if (script && !script.startsWith("/$bunfs/root/") && existsSync(script))
		return { command: host.execPath, args: [script, ...args] };
	const executable = basename(host.execPath).toLowerCase();
	return /^(node|bun)(\.exe)?$/.test(executable)
		? { command: "pi", args: [...args] }
		: { command: host.execPath, args: [...args] };
}
