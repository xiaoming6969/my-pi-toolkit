import assert from "node:assert/strict";
import test from "node:test";
import { acquireWorkerSlot } from "../worker-semaphore.ts";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("caps workers from multiple batches at six", async () => {
	let active = 0;
	let peak = 0;
	const run = async () => {
		const release = await acquireWorkerSlot(new AbortController().signal);
		active++;
		peak = Math.max(peak, active);
		await tick();
		active--;
		release();
	};
	await Promise.all([
		...Array.from({ length: 7 }, run),
		...Array.from({ length: 7 }, run),
	]);
	assert.equal(peak, 6);
});

test("grants queued slots in FIFO order and release is idempotent", async () => {
	const holders = await Promise.all(
		Array.from({ length: 6 }, () =>
			acquireWorkerSlot(new AbortController().signal),
		),
	);
	const order: number[] = [];
	const queued = [1, 2, 3].map(async (id) => {
		const release = await acquireWorkerSlot(new AbortController().signal);
		order.push(id);
		return release;
	});
	for (let index = 0; index < holders.length; index++) {
		holders[index]?.();
		await tick();
		if (index < 3) assert.deepEqual(order, [1, 2, 3].slice(0, index + 1));
	}
	const queuedReleases = await Promise.all(queued);
	for (const release of queuedReleases) {
		release();
		release();
	}
});

test("removes cancelled waiters and releases after failure", async () => {
	const holders = await Promise.all(
		Array.from({ length: 6 }, () =>
			acquireWorkerSlot(new AbortController().signal),
		),
	);
	const cancelledController = new AbortController();
	const cancelled = acquireWorkerSlot(cancelledController.signal);
	const next = acquireWorkerSlot(new AbortController().signal);
	cancelledController.abort();
	await assert.rejects(cancelled, /取消/);
	holders[0]?.();
	const releaseNext = await next;
	releaseNext();
	for (const release of holders.slice(1)) release();

	const release = await acquireWorkerSlot(new AbortController().signal);
	try {
		throw new Error("worker failed");
	} catch (error) {
		assert.match(String(error), /worker failed/);
	} finally {
		release();
	}
	const finalRelease = await acquireWorkerSlot(new AbortController().signal);
	finalRelease();
});
