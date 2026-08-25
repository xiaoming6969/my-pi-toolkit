import { resolve } from "node:path";
import { normalizeTaskPath, pathsOverlap } from "./task-policy.js";

export interface FollowupPathOwner {
	batchId: string;
	workerId: string;
}

interface FollowupPathLock extends FollowupPathOwner {
	subagentId: string;
	kind: "implementation" | "research";
	cwd: string;
	paths: string[];
}

const LOCKS_KEY = Symbol.for("my-pi-toolkit.multi-task-followup-locks");
const globalState = globalThis as Record<PropertyKey, unknown>;
const existing = globalState[LOCKS_KEY];
const locks =
	existing instanceof Map
		? (existing as Map<string, FollowupPathLock>)
		: new Map<string, FollowupPathLock>();
globalState[LOCKS_KEY] = locks;

export function findFollowupPathOwner(
	cwd: string,
	path: string,
	includeResearch = false,
): FollowupPathOwner | undefined {
	const candidate = normalizeTaskPath(cwd, path);
	for (const lock of locks.values()) {
		if (resolve(lock.cwd) !== resolve(cwd)) continue;
		if (!includeResearch && lock.kind === "research") continue;
		if (!lock.paths.some((allowed) => pathsOverlap(candidate, allowed))) continue;
		return { batchId: lock.batchId, workerId: lock.workerId };
	}
	return undefined;
}

export function reserveFollowupPaths(options: FollowupPathLock): () => void {
	for (const path of options.paths) {
		const owner = findFollowupPathOwner(
			options.cwd,
			path,
			options.kind === "implementation",
		);
		if (owner)
			throw new Error(
				`任务路径正由 worker ${owner.workerId} 使用（batch ${owner.batchId}）: ${path}`,
			);
	}
	locks.set(options.subagentId, options);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		if (locks.get(options.subagentId) === options)
			locks.delete(options.subagentId);
	};
}
