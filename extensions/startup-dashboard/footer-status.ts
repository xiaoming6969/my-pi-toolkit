import { stripVTControlCharacters } from "node:util";

const INTEGRATED_STATUS_KEYS = new Set([
	"agent-todos",
	"session-branch",
	"subagent",
]);
const STATUS_PRIORITY = ["tokenSpeed", "ponytail", "pi-lens-lsp"];

type StatusTone = "accent" | "dim" | "error" | "muted" | "success" | "warning";
type StatusGlyph = "active" | "pending";
interface AdaptedStatus {
	id: string;
	text: string;
	tone: StatusTone;
	glyph?: StatusGlyph;
}
type StatusContent = Omit<AdaptedStatus, "id">;

function plainText(text: string): string {
	return stripVTControlCharacters(text)
		.replace(/\u200b/g, "")
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

function tokenSpeed(text: string): StatusContent {
	const value = text
		.replace(/^⚡\s*TPS:\s*/i, "")
		.replace(/TTFT:\s*/gi, "ttft ");
	const speed = Number.parseFloat(value);
	let tone: StatusTone = "muted";
	if (Number.isFinite(speed)) {
		if (speed < 15) tone = "error";
		else if (speed < 30) tone = "warning";
		else if (speed < 45) tone = "success";
		else tone = "accent";
	}
	return { text: `tps ${value}`, tone };
}

function ponytail(text: string): StatusContent {
	const mode = text.match(/\b(lite|full|ultra)\b/i)?.[1]?.toLowerCase();
	return {
		text: mode ? `ponytail:${mode}` : "ponytail",
		tone: "muted",
		glyph: text.includes("●") ? "active" : "pending",
	};
}

function piLens(text: string): StatusContent {
	if (/LSP Failed:/i.test(text)) return { text: "lsp:error", tone: "error" };
	if (/LSP Active:/i.test(text)) return { text: "lsp:on", tone: "success" };
	return { text: "lsp:off", tone: "dim" };
}

const ADAPTERS = new Map<string, (text: string) => StatusContent>([
	["pi-lens-lsp", piLens],
	["ponytail", ponytail],
	["tokenSpeed", tokenSpeed],
]);

export function extensionStatusTexts(
	statuses: ReadonlyMap<string, string> | undefined,
): AdaptedStatus[] {
	if (!statuses) return [];
	const priority = (key: string): number => {
		const index = STATUS_PRIORITY.indexOf(key);
		return index < 0 ? STATUS_PRIORITY.length : index;
	};
	return Array.from(statuses.entries())
		.filter(([key]) => !INTEGRATED_STATUS_KEYS.has(key))
		.sort(
			([left], [right]) =>
				priority(left) - priority(right) || left.localeCompare(right),
		)
		.flatMap(([id, rawText]) => {
			const text = plainText(rawText);
			if (!text) return [];
			const content: StatusContent = ADAPTERS.get(id)?.(text) ?? {
				text,
				tone: "muted",
			};
			return [{ id, ...content }];
		});
}
