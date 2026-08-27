import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

export interface FakePi {
	pi: ExtensionAPI;
	events: Map<string, Handler[]>;
	commands: Map<string, { description?: string; handler: Function; getArgumentCompletions?: Function }>;
	tools: Map<string, Record<string, unknown>>;
	shortcuts: unknown[];
	providers: Map<string, unknown>;
	messageRenderers: Map<string, unknown>;
	entryRenderers: Map<string, unknown>;
	messages: unknown[];
	userMessages: unknown[];
	entries: Array<{ type: string; data: unknown }>;
	activeTools: string[];
	thinkingLevel: string;
	execCalls: Array<{ file: string; args: string[] }>;
}

export function createFakePi(overrides: Partial<ExtensionAPI> = {}): FakePi {
	const events = new Map<string, Handler[]>();
	const commands = new Map<string, { description?: string; handler: Function; getArgumentCompletions?: Function }>();
	const tools = new Map<string, Record<string, unknown>>();
	const shortcuts: unknown[] = [];
	const providers = new Map<string, unknown>();
	const messageRenderers = new Map<string, unknown>();
	const entryRenderers = new Map<string, unknown>();
	const messages: unknown[] = [];
	const userMessages: unknown[] = [];
	const entries: Array<{ type: string; data: unknown }> = [];
	const activeTools = [
		"read",
		"write",
		"edit",
		"bash",
		"grep",
		"find",
		"ls",
		"ask_user_choice",
	];
	const state: FakePi = {
		pi: {} as ExtensionAPI,
		events,
		commands,
		tools,
		shortcuts,
		providers,
		messageRenderers,
		entryRenderers,
		messages,
		userMessages,
		entries,
		activeTools,
		thinkingLevel: "off",
		execCalls: [],
	};
	const pi = {
		on(event: string, handler: Handler) {
			const list = events.get(event) ?? [];
			list.push(handler);
			events.set(event, list);
		},
		registerCommand(name: string, options: { description?: string; handler: Function; getArgumentCompletions?: Function }) {
			commands.set(name, options);
		},
		registerTool(tool: { name: string }) {
			tools.set(tool.name, tool as Record<string, unknown>);
		},
		registerShortcut(shortcut: unknown, options: unknown) {
			shortcuts.push({ shortcut, options });
		},
		registerFlag() {},
		getFlag() {
			return undefined;
		},
		registerMessageRenderer(type: string, renderer: unknown) {
			messageRenderers.set(type, renderer);
		},
		registerMarkdownTransformer() {},
		registerEntryRenderer(type: string, renderer: unknown) {
			entryRenderers.set(type, renderer);
		},
		registerProvider(id: string, provider: unknown) {
			providers.set(id, provider);
		},
		sendMessage(message: unknown) {
			messages.push(message);
		},
		sendUserMessage(content: unknown) {
			userMessages.push(content);
		},
		appendEntry(type: string, data: unknown) {
			entries.push({ type, data });
		},
		getAllTools() {
			return [
				...activeTools.map((name) => ({ name })),
				...[...tools.keys()].map((name) => ({ name })),
			];
		},
		getActiveTools() {
			return [...activeTools];
		},
		setActiveTools(names: string[]) {
			state.activeTools.splice(0, state.activeTools.length, ...names);
		},
		getCommands() {
			return [...commands.entries()].map(([name, definition]) => ({
				name,
				...definition,
			}));
		},
		getThinkingLevel() {
			return state.thinkingLevel;
		},
		setThinkingLevel(level: string) {
			state.thinkingLevel = level;
		},
		async setModel() {
			return true;
		},
		async exec(file: string, args: string[]) {
			state.execCalls.push({ file, args });
			return { code: 0, stdout: "", stderr: "" };
		},
		...overrides,
	} as ExtensionAPI;
	state.pi = pi;
	return state;
}

export interface FakeContextOptions {
	cwd?: string;
	hasUI?: boolean;
	isIdle?: boolean;
	trusted?: boolean;
	mode?: string;
	entries?: unknown[];
	sessionFile?: string;
	sessionDir?: string;
}

export function createFakeContext(options: FakeContextOptions = {}) {
	const notifies: Array<{ message: string; level?: string }> = [];
	const statuses = new Map<string, string | undefined>();
	const widgets = new Map<string, unknown>();
	let header: unknown;
	let footer: unknown;
	const ctx = {
		cwd: options.cwd ?? process.cwd(),
		hasUI: options.hasUI ?? false,
		mode: options.mode ?? "rpc",
		isIdle: () => options.isIdle !== false,
		isProjectTrusted: () => options.trusted !== false,
		projectTrusted: options.trusted !== false,
		thinkingLevel: "off",
		model: { provider: "openai", id: "gpt" },
		modelRegistry: {
			find: (provider: string, id: string) => ({ provider, id }),
		},
		sessionManager: {
			getEntries: () => options.entries ?? [],
			getBranch: () => options.entries ?? [],
			getSessionFile: () => options.sessionFile,
			getSessionDir: () => options.sessionDir,
			getSessionId: () => "test-session",
		},
		ui: {
			notify(message: string, level?: string) {
				notifies.push({ message, level });
			},
			setStatus(key: string, value: string | undefined) {
				statuses.set(key, value);
			},
			setWidget(key: string, value: unknown) {
				widgets.set(key, value);
			},
			setHeader(value: unknown) {
				header = value;
			},
			setFooter(value: unknown) {
				footer = value;
			},
			setWorkingMessage() {},
			onTerminalInput() {
				return () => {};
			},
			async select(_title: string, choices: string[]) {
				return choices[0];
			},
			async input() {
				return "";
			},
			async confirm() {
				return true;
			},
			async editor() {
				return "";
			},
		},
		getContextUsage() {
			return undefined;
		},
		async waitForIdle() {},
		async reload() {},
		async switchSession() {
			return { cancelled: false };
		},
		notifies,
		statuses,
		widgets,
		get header() {
			return header;
		},
		get footer() {
			return footer;
		},
	};
	return ctx as typeof ctx & ExtensionContext & ExtensionCommandContext;
}

export async function withTempAgentDir(
	t: Pick<TestContext, "after">,
	run: (dir: string) => Promise<void> | void,
): Promise<void> {
	const dir = await mkdtemp(join(tmpdir(), "pi-agent-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = dir;
	try {
		await run(dir);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
	}
}
