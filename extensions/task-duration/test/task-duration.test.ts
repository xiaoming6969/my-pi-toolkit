import assert from "node:assert/strict";
import test from "node:test";
import type {
	CustomEntry,
	ExtensionAPI,
	ExtensionContext,
	Theme,
} from "@earendil-works/pi-coding-agent";
import taskDuration from "../index.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as Theme;

function install(t: test.TestContext) {
	const listeners = new Map<string, (event: unknown, ctx: ExtensionContext) => void>();
	const entries: Array<{ type: string; data: unknown }> = [];
	let renderer:
		| ((
				entry: CustomEntry<{ durationMs: number; completedAt: number }>,
				options: unknown,
				theme: Theme,
		  ) => { render: (width: number) => string[] })
		| undefined;
	let now = 1_000;
	t.mock.method(performance, "now", () => now);

	taskDuration({
		registerEntryRenderer(_type, render) {
			renderer = render;
		},
		on(event, handler) {
			listeners.set(event, handler);
		},
		appendEntry(type, data) {
			entries.push({ type, data });
		},
	} as ExtensionAPI);

	return {
		listeners,
		entries,
		setNow(value: number) {
			now = value;
		},
		render(
			entry: CustomEntry<{ durationMs: number; completedAt: number }>,
		): string {
			assert.ok(renderer);
			return renderer(entry, {}, theme).render(80).join("\n");
		},
	};
}

test("records tui task duration once per start/settle cycle", (t) => {
	const { listeners, entries, setNow, render } = install(t);
	const tui = { mode: "tui" } as ExtensionContext;
	listeners.get("agent_start")?.({}, { mode: "rpc" } as ExtensionContext);
	listeners.get("agent_settled")?.(
		{},
		tui,
	);
	assert.equal(entries.length, 0);

	listeners.get("agent_start")?.({}, tui);
	setNow(2_500);
	listeners.get("agent_start")?.({}, tui);
	listeners.get("agent_settled")?.({}, tui);
	assert.equal(entries.length, 1);
	assert.equal(entries[0]?.type, "task-duration");
	const data = entries[0]?.data as { durationMs: number };
	assert.equal(data.durationMs, 1_500);
	assert.match(render(entries[0] as never), /本次任务耗时 2s/);

	listeners.get("agent_settled")?.({}, tui);
	assert.equal(entries.length, 1);

	listeners.get("session_shutdown")?.({}, tui);
	setNow(4_000);
	listeners.get("agent_settled")?.({}, tui);
	assert.equal(entries.length, 1);
});

test("duration renderer treats invalid values as zero", (t) => {
	const { render } = install(t);
	assert.match(
		render({ data: { durationMs: Number.NaN, completedAt: 0 } } as never),
		/本次任务耗时 0s/,
	);
});
