import { existsSync, readdirSync, statSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

export const SUBAGENT_RUNS_ROOT = join(tmpdir(), "my-pi-toolkit-subagents");

export function subagentRunDir(id: string): string {
	return join(SUBAGENT_RUNS_ROOT, id);
}

/**
 * Newest session file of a run (by mtime, then name). Pi writes one file per
 * session branch under `sessions/`, so the most recently written one is the
 * branch the child actually continued.
 */
export function latestSessionFile(runDir: string): string | undefined {
	const sessionsDir = join(runDir, "sessions");
	if (!existsSync(sessionsDir)) return undefined;
	try {
		const candidates = readdirSync(sessionsDir)
			.filter((name) => name.endsWith(".jsonl"))
			.map((name) => {
				const path = join(sessionsDir, name);
				return { path, name, mtimeMs: statSync(path).mtimeMs };
			})
			.sort(
				(left, right) =>
					right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name),
			);
		return candidates[0]?.path;
	} catch {
		return undefined;
	}
}

/**
 * Copy caller-provided artifact files into the run directory and rewrite the
 * task text to reference the copies, so the child never depends on temp files
 * the parent may clean up while the child is still running.
 */
export async function prepareTaskArtifacts(
	runDir: string,
	task: string,
	artifactFiles: readonly string[],
): Promise<string> {
	let prepared = task;
	const artifactsDir = join(runDir, "artifacts");
	await mkdir(artifactsDir, { recursive: true, mode: 0o700 });
	for (let index = 0; index < artifactFiles.length; index += 1) {
		const source = artifactFiles[index];
		const destination = join(artifactsDir, `${index + 1}-${basename(source)}`);
		await copyFile(source, destination);
		prepared = prepared.split(source).join(destination);
	}
	return prepared;
}
