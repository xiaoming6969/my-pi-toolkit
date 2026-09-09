import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { CustomEntry, Theme } from "@earendil-works/pi-coding-agent";
import { BrowserReviewManager } from "../../browser-review/server.ts";
import {
	createFakeContext,
	createFakePi,
} from "../../shared/test/fake-extension.ts";
import turnDiff from "../index.ts";
import { ENTRY_TYPE, type TurnDiffEntry } from "../entry.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

async function emit(
	fake: ReturnType<typeof createFakePi>,
	event: string,
	payload: unknown,
	ctx: unknown,
): Promise<void> {
	for (const handler of fake.events.get(event) ?? []) {
		await handler(payload, ctx as never);
	}
}

test("records a turn-diff entry after tui edit/write and restores it", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "turn-diff-ext-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeFile(join(root, "app.ts"), "old\n");
	const fake = createFakePi();
	turnDiff(fake.pi);
	const tui = createFakeContext({ cwd: root, mode: "tui", hasUI: true, trusted: true });

	await emit(fake, "agent_start", {}, createFakeContext({ cwd: root, mode: "rpc" }));
	await emit(fake, "agent_settled", {}, tui);
	assert.equal(fake.entries.length, 0);

	await emit(fake, "agent_start", {}, tui);
	await emit(fake, "tool_call", {
		toolName: "read",
		input: { path: "app.ts" },
	}, tui);
	await emit(fake, "tool_call", {
		toolName: "edit",
		input: { path: "app.ts" },
	}, tui);
	await emit(fake, "agent_start", {}, tui);
	await writeFile(join(root, "app.ts"), "new\n");
	await emit(fake, "agent_settled", {}, tui);
	assert.equal(fake.entries.length, 1);
	assert.equal(fake.entries[0]?.type, ENTRY_TYPE);
	const data = fake.entries[0]?.data as TurnDiffEntry;
	assert.match(data.patch, /\-old/);
	assert.match(data.patch, /\+new/);

	const renderer = fake.entryRenderers.get(ENTRY_TYPE) as (
		entry: CustomEntry<TurnDiffEntry>,
		options: { expanded: boolean },
		theme: Theme,
	) => { render: (width: number) => string[] };
	assert.match(
		renderer({ data } as CustomEntry<TurnDiffEntry>, { expanded: false }, theme)
			.render(80)
			.join("\n"),
		/本轮修改 1 个文件/,
	);

	await emit(fake, "agent_settled", {}, tui);
	assert.equal(fake.entries.length, 1);

	const restored = createFakePi();
	turnDiff(restored.pi);
	const restoredCtx = createFakeContext({
		cwd: root,
		mode: "tui",
		hasUI: true,
		entries: [{ type: "custom", customType: ENTRY_TYPE, data }],
	});
	await emit(restored, "session_start", {}, restoredCtx);
	t.mock.method(BrowserReviewManager.prototype, "open", async () => ({
		status: "closed" as const,
	}));
	await restored.commands.get("turn-diff")?.handler("", restoredCtx);
	assert.equal(restoredCtx.notifies.length, 0);
});

test("turn-diff command notifies, sends feedback, and reports browser errors", async (t) => {
	const fake = createFakePi();
	turnDiff(fake.pi);
	const tui = createFakeContext({ mode: "tui", hasUI: true });
	await fake.commands.get("turn-diff")?.handler("", tui);
	assert.match(String(tui.notifies[0]?.message), /还没有本轮修改/);

	const rpc = createFakeContext({ mode: "rpc", hasUI: true });
	await fake.commands.get("turn-diff")?.handler("", rpc);
	assert.equal(rpc.notifies.length, 0);

	const tooLarge = createFakeContext({
		mode: "tui",
		hasUI: true,
		entries: [
			{
				type: "custom",
				customType: ENTRY_TYPE,
				data: {
					files: [{ path: "a.ts", added: 1, removed: 0 }],
					added: 1,
					removed: 0,
					patch: "",
					tooLarge: true,
				},
			},
		],
	});
	await fake.commands.get("turn-diff")?.handler("", tooLarge);
	assert.match(String(tooLarge.notifies[0]?.message), /超过 5 MiB/);

	const ready = createFakeContext({
		mode: "tui",
		hasUI: true,
		isIdle: true,
		entries: [
			{
				type: "custom",
				customType: ENTRY_TYPE,
				data: {
					files: [{ path: "a.ts", added: 1, removed: 0 }],
					added: 1,
					removed: 0,
					patch: "diff --git a/a.ts b/a.ts\n+ok\n",
				},
			},
		],
	});
	t.mock.method(BrowserReviewManager.prototype, "open", async () => ({
		status: "feedback" as const,
		feedback: "fix this",
		annotations: [],
	}));
	await fake.commands.get("turn-diff")?.handler("", ready);
	assert.match(String(fake.userMessages[0]), /fix this/);

	t.mock.method(BrowserReviewManager.prototype, "open", async () => ({
		status: "unavailable" as const,
		error: "no browser",
	}));
	const busy = createFakeContext({
		mode: "tui",
		hasUI: true,
		isIdle: false,
		entries: ready.sessionManager.getEntries(),
	});
	await fake.commands.get("turn-diff")?.handler("", busy);
	assert.match(String(busy.notifies[0]?.message), /no browser/);
	assert.equal((fake.userMessages[1] as { deliverAs?: string } | undefined), undefined);

	t.mock.method(BrowserReviewManager.prototype, "open", async () => {
		throw new Error("boom");
	});
	const failed = createFakeContext({
		mode: "tui",
		hasUI: true,
		entries: ready.sessionManager.getEntries(),
	});
	await fake.commands.get("turn-diff")?.handler("", failed);
	assert.match(String(failed.notifies[0]?.message), /boom/);

	await emit(fake, "session_shutdown", {}, tui);
});
