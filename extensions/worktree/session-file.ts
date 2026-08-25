import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SessionHeader } from "@earendil-works/pi-coding-agent";

export function rewriteSessionCwd(sessionFile: string, cwd: string): string {
	const content = readFileSync(sessionFile, "utf8");
	const newline = content.indexOf("\n");
	const firstLine = newline < 0 ? content : content.slice(0, newline);
	let header: SessionHeader;
	try {
		header = JSON.parse(firstLine) as SessionHeader;
	} catch {
		throw new Error("当前会话文件头无效，无法切换工作目录");
	}
	if (header.type !== "session" || !header.id || !header.cwd)
		throw new Error("当前会话文件头无效，无法切换工作目录");
	const next = `${JSON.stringify({ ...header, cwd: resolve(cwd) })}${
		newline < 0 ? "\n" : content.slice(newline)
	}`;
	const temp = `${sessionFile}.worktree-${process.pid}.tmp`;
	writeFileSync(temp, next, "utf8");
	renameSync(temp, sessionFile);
	return header.cwd;
}
