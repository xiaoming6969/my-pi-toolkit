import { copyFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

export const SUBAGENT_RUNS_ROOT = join(tmpdir(), "my-pi-toolkit-subagents");

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
