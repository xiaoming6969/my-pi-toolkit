import type { Theme } from "@earendil-works/pi-coding-agent";
import { statusGlyph, thinkingLevelText } from "../shared/tui/visual-language.js";
import type { FooterSnapshot } from "./footer-data.js";

export interface FooterSegment {
	id: string;
	content: string;
}

function modelText(snapshot: FooterSnapshot, theme: Theme): string | undefined {
	const provider = snapshot.provider
		? theme.fg("dim", snapshot.provider)
		: undefined;
	const model = snapshot.model
		? theme.bold(theme.fg("accent", snapshot.model))
		: undefined;
	if (provider && model) return `${provider}${theme.fg("dim", "/")}${model}`;
	return provider ?? model;
}

export function identitySegments(
	snapshot: FooterSnapshot,
	theme: Theme,
): FooterSegment[] {
	return [
		snapshot.modeStatus
			? { id: "mode", content: snapshot.modeStatus }
			: undefined,
		snapshot.project
			? {
					id: "project",
					content: `${theme.fg("accent", "◆")} ${theme.bold(theme.fg("text", snapshot.project))}`,
				}
			: undefined,
		snapshot.branch
			? {
					id: "branch",
					content: `${theme.fg("muted", "")} ${theme.fg("muted", snapshot.branch)}`,
				}
			: undefined,
		snapshot.branchMismatch
			? {
					id: "branch-status",
					content: `${statusGlyph(theme, "error")} ${theme.fg("error", "branch mismatch")}`,
				}
			: undefined,
		snapshot.title
			? { id: "title", content: theme.fg("text", snapshot.title) }
			: undefined,
	].filter((segment): segment is FooterSegment => segment !== undefined);
}

export function runtimeSegments(
	snapshot: FooterSnapshot,
	theme: Theme,
	compact = false,
): FooterSegment[] {
	const model = modelText(snapshot, theme);
	return [
		model ? { id: "model", content: model } : undefined,
		snapshot.thinking
			? {
					id: "thinking",
					content: thinkingLevelText(snapshot.thinking, theme, compact),
				}
			: undefined,
		snapshot.subagentStatus
			? {
					id: "subagent",
					content: theme.fg("warning", snapshot.subagentStatus),
				}
			: undefined,
	].filter((segment): segment is FooterSegment => segment !== undefined);
}
