import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { RepoSearchRunConfig } from "../repo-search-subagent/types.js";
import { getLiveSubagent, setLiveSubagentIdleTimeout, setSubagentFollowupGuard } from "../shared/subagent/registry.js";
import { batches } from "./batch-store.js";
import {
	findFollowupPathOwner,
	reserveFollowupPaths,
} from "./followup-lock.js";
import { createProgressEmitter, type ProgressEmitter } from "./progress.js";
import {
	normalizeTaskPath,
	pathsOverlap,
	validateTasks,
} from "./task-policy.js";
import type {
	MultiTaskBatch,
	MultiTaskBatchHandle,
	MultiTaskInputTask,
	MultiTaskWorker,
	NormalizedMultiTaskTask,
} from "./types.js";
import { executeWorker } from "./worker-runner.js";
import { acquireWorkerSlot } from "./worker-semaphore.js";

const WORKER_IDLE_TIMEOUT_MS = 2 * 60_000;
const progressEmitters = new Map<string, ProgressEmitter>();

function workerFrom(
	task: NormalizedMultiTaskTask,
	implementationModel: string,
	researchConfig: RepoSearchRunConfig | undefined,
	thinkingLevel: string | undefined,
): MultiTaskWorker {
	return {
		...task,
		model:
			task.kind === "research"
				? (researchConfig?.model ?? implementationModel)
				: implementationModel,
		thinkingLevel:
			task.kind === "research" ? researchConfig?.thinkingLevel : thinkingLevel,
		status: "queued",
		toolCalls: [],
		controller: new AbortController(),
	};
}

function installWorkerFollowupGuard(
	batch: MultiTaskBatch,
	worker: MultiTaskWorker,
): void {
	if (
		worker.status !== "completed" ||
		!worker.reusable ||
		!worker.subagentId
	)
		return;
	const subagentId = worker.subagentId;
	const includeResearch = worker.kind === "implementation";
	const installed = setSubagentFollowupGuard(subagentId, () => {
		for (const path of worker.paths) {
			const owner = activePathOwner(batch.cwd, path, includeResearch);
			if (owner)
				throw new Error(
					`任务路径正由 worker ${owner.workerId} 使用（batch ${owner.batchId}）: ${path}`,
				);
		}
		return reserveFollowupPaths({
			subagentId,
			kind: worker.kind,
			batchId: batch.id,
			workerId: worker.id,
			cwd: batch.cwd,
			paths: worker.paths,
		});
	});
	if (!installed) worker.reusable = false;
}

async function executeBatch(options: {
	batch: MultiTaskBatch;
	extensionPaths: string[];
	researchConfig: RepoSearchRunConfig | undefined;
	onSettled: ((batch: MultiTaskBatch) => void) | undefined;
	progress: ProgressEmitter;
}): Promise<void> {
	const { batch, extensionPaths, researchConfig, onSettled, progress } = options;
	let cursor = 0;
	const runNext = async (): Promise<void> => {
		if (cursor >= batch.workers.length || batch.cancelRequested) return;
		const worker = batch.workers[cursor++];
		try {
			const release = await acquireWorkerSlot(worker.controller.signal);
			try {
				await executeWorker({
					batch,
					worker,
					extensionPaths,
					researchConfig,
					emitProgress: progress.emit,
				});
			} finally {
				release();
			}
		} catch (error) {
			if (worker.status === "queued") {
				worker.status = batch.cancelRequested ? "cancelled" : "failed";
				worker.progress = worker.status;
				worker.error =
					error instanceof Error ? error.message : String(error);
				worker.completedAt = new Date().toISOString();
				progress.emit();
			}
		}
		installWorkerFollowupGuard(batch, worker);
		return runNext();
	};
	await Promise.all(
		Array.from(
			{ length: Math.min(batch.maxConcurrency, batch.workers.length) },
			runNext,
		),
	);
	if (batch.cancelRequested) {
		for (const worker of batch.workers)
			if (worker.status === "queued") {
				worker.status = "cancelled";
				worker.progress = "cancelled";
			}
		batch.status = "cancelled";
	} else {
		batch.status = batch.workers.some((worker) => worker.status === "failed")
			? "failed"
			: "completed";
	}
	batch.completedAt = new Date().toISOString();
	for (const worker of batch.workers)
		if (
			worker.reusable &&
			worker.subagentId &&
			!setLiveSubagentIdleTimeout(
				worker.subagentId,
				WORKER_IDLE_TIMEOUT_MS,
			)
		)
			worker.reusable = false;
	progress.flush();
	try {
		onSettled?.(batch);
	} catch {
		// The parent session may already be shutting down; results remain collectable.
	}
}

export function startBatch(options: {
	cwd: string;
	model: string;
	thinkingLevel?: string;
	parentSessionId: string;
	tasks: MultiTaskInputTask[];
	maxConcurrency: number;
	implementationTools: string[];
	extensionPaths: string[];
	keepOpen: boolean;
	researchConfig?: RepoSearchRunConfig;
	onProgress?: (batch: MultiTaskBatch) => void;
	onSettled?: (batch: MultiTaskBatch) => void;
	signal?: AbortSignal;
}): MultiTaskBatchHandle {
	const tasks = validateTasks(options.cwd, options.tasks);
	if (tasks.some((task) => task.kind === "research") && !options.researchConfig)
		throw new Error("research 任务需要 Repo Search 配置");
	for (const task of tasks) {
		for (const path of task.paths) {
			const owner = findActiveTaskConflict(options.cwd, path, task.kind);
			if (owner)
				throw new Error(
					`任务路径正由 worker ${owner.workerId} 使用（batch ${owner.batchId}）: ${path}`,
				);
		}
	}
	const batch: MultiTaskBatch = {
		id: randomUUID(),
		cwd: options.cwd,
		model: options.model,
		thinkingLevel: options.thinkingLevel,
		parentSessionId: options.parentSessionId,
		status: "running",
		createdAt: new Date().toISOString(),
		maxConcurrency: Math.min(6, Math.max(1, options.maxConcurrency)),
		implementationTools: options.implementationTools,
		keepOpen: options.keepOpen,
		cancelRequested: false,
		workers: tasks.map((task) =>
			workerFrom(
				task,
				options.model,
				options.researchConfig,
				options.thinkingLevel,
			),
		),
	};
	batches.set(batch.id, batch);
	const progress = createProgressEmitter(batch, options.onProgress);
	progressEmitters.set(batch.id, progress);
	const abort = () => cancelBatch(batch);
	if (options.signal?.aborted) abort();
	else options.signal?.addEventListener("abort", abort, { once: true });
	progress.flush();
	const completion = executeBatch({
		batch,
		extensionPaths: options.extensionPaths,
		researchConfig: options.researchConfig,
		onSettled: options.onSettled,
		progress,
	}).finally(() => {
		options.signal?.removeEventListener("abort", abort);
		progress.flush();
		progressEmitters.delete(batch.id);
	});
	return { batch, completion: completion.then(() => batch) };
}

export function getBatch(id: string): MultiTaskBatch | undefined {
	const batch = batches.get(id);
	if (!batch) return undefined;
	batch.workers.forEach((worker) => {
		worker.toolCalls ??= [];
		worker.kind ??= "implementation";
		worker.model ??= batch.model;
	});
	return batch;
}

export function cancelBatch(batch: MultiTaskBatch): void {
	if (batch.status !== "running") return;
	batch.cancelRequested = true;
	for (const worker of batch.workers) {
		if (worker.status === "running" || worker.status === "queued")
			worker.controller.abort();
		if (worker.status === "queued") worker.status = "cancelled";
	}
	progressEmitters.get(batch.id)?.emit();
}

function activePathOwner(
	cwd: string,
	path: string,
	includeResearch: boolean,
): { batchId: string; workerId: string } | undefined {
	const candidate = normalizeTaskPath(cwd, path);
	let owner: { batchId: string; workerId: string } | undefined;
	batches.forEach((batch) => {
		if (owner || batch.status !== "running" || resolve(batch.cwd) !== resolve(cwd))
			return;
		const worker = batch.workers.find(
			(candidateWorker) =>
				(includeResearch || candidateWorker.kind === "implementation") &&
				(candidateWorker.status === "queued" ||
					candidateWorker.status === "running") &&
				candidateWorker.paths.some((allowed) =>
					pathsOverlap(candidate, allowed),
				),
		);
		if (worker) owner = { batchId: batch.id, workerId: worker.id };
	});
	return owner;
}

function findActiveTaskConflict(
	cwd: string,
	path: string,
	kind: NormalizedMultiTaskTask["kind"],
): { batchId: string; workerId: string } | undefined {
	const includeResearch = kind === "implementation";
	return (
		activePathOwner(cwd, path, includeResearch) ??
		findFollowupPathOwner(cwd, path, includeResearch)
	);
}

export function findActivePathOwner(
	cwd: string,
	path: string,
): { batchId: string; workerId: string } | undefined {
	return (
		activePathOwner(cwd, path, false) ?? findFollowupPathOwner(cwd, path)
	);
}

export function cancelBatchesForSession(parentSessionId: string): void {
	batches.forEach((batch) => {
		if (batch.parentSessionId !== parentSessionId) return;
		if (batch.status === "running") cancelBatch(batch);
		for (const worker of batch.workers)
			if (worker.subagentId) getLiveSubagent(worker.subagentId)?.dispose();
	});
}
