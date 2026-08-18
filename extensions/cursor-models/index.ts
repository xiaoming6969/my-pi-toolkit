/**
 * Collapse Cursor flat model variants into family + thinking level,
 * and expose Fast as a toggle (/fast).
 */
import type {
	ExtensionAPI,
	ExtensionContext,
	ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";
import {
	buildFamilies,
	findFamilyForRawId,
	readCachedModels,
	resolveCursorModelId,
	toProviderModels,
	type ModelFamily,
} from "./collapse.js";
import { isFast, setFast, toggleFast } from "./fast-state.js";
import { LEVEL_TO_PI } from "./parse.js";
import openCursorExtension from "../../vendor/open-cursor/pi-agent/src/index.js";

type StreamSimple = (
	model: { id: string; [key: string]: unknown },
	context: unknown,
	options?: { reasoning?: string },
) => unknown;

/**
 * Frozen upstream stream from the pre-wrap composed provider.
 * Must capture before re-register, otherwise the new stream would recurse into itself.
 */
let upstreamStream: StreamSimple | undefined;
let families = new Map<string, ModelFamily>();

function refreshFamilies(): Map<string, ModelFamily> {
	families = buildFamilies(readCachedModels());
	return families;
}

function collapsedModels(): ProviderModelConfig[] {
	return toProviderModels(refreshFamilies());
}

function applyProvider(pi: ExtensionAPI, ctx: ExtensionContext): void {
	const provider = ctx.modelRegistry.getProvider("cursor-agent");
	if (!provider?.streamSimple) return;

	// Capture once while provider still uses open-cursor's streamSimple.
	if (!upstreamStream) {
		const frozen = provider;
		upstreamStream = ((model, context, options) =>
			frozen.streamSimple!(model, context, options)) as StreamSimple;
	}

	const models = collapsedModels();
	if (models.length === 0) return;

	pi.registerProvider("cursor-agent", {
		baseUrl: provider.baseUrl ?? "https://api2.cursor.sh",
		api: "cursor-agent",
		models,
		streamSimple: (
			model: Parameters<StreamSimple>[0],
			context: Parameters<StreamSimple>[1],
			options: Parameters<StreamSimple>[2],
		) => {
			const resolvedId = resolveCursorModelId(
				model.id,
				options?.reasoning,
				isFast(),
				families,
			);
			return upstreamStream!({ ...model, id: resolvedId }, context, options);
		},
	});
}

async function migrateActiveModel(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<void> {
	const model = ctx.model;
	if (!model || model.provider !== "cursor-agent") return;

	const hit = findFamilyForRawId(model.id, families);
	if (!hit) return;
	if (model.id === hit.family.id) return;

	if (hit.fast) setFast(true);

	const canonical = ctx.modelRegistry.find("cursor-agent", hit.family.id);
	if (!canonical) return;

	await pi.setModel(canonical);
	if (hit.level) {
		const piLevel = LEVEL_TO_PI[hit.level] as
			| Parameters<ExtensionAPI["setThinkingLevel"]>[0]
			| undefined;
		if (piLevel) pi.setThinkingLevel(piLevel);
	}
}

function toggleFastUi(ctx: ExtensionContext): void {
	const family = families.get(ctx.model?.id ?? "");
	if (ctx.model?.provider === "cursor-agent" && family && !family.hasFast) {
		ctx.ui.notify("当前模型没有 Fast 变体", "warning");
		return;
	}

	const next = toggleFast();
	ctx.ui.notify(next ? "Fast: on" : "Fast: off", "info");
}

export default function (pi: ExtensionAPI) {
	// Run the open-cursor provider extension first (registers cursor-agent provider, OAuth, session, etc.)
	openCursorExtension(pi);

	pi.registerCommand("fast", {
		description: "Toggle Cursor Fast mode",
		handler: async (_args: string, ctx: ExtensionContext) => {
			toggleFastUi(ctx);
		},
	});

	pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
		applyProvider(pi, ctx);
		await migrateActiveModel(pi, ctx);
	});

	pi.on(
		"model_select",
		async (event: { model: { provider: string } }, ctx: ExtensionContext) => {
			if (event.model.provider === "cursor-agent") {
				applyProvider(pi, ctx);
			}
		},
	);
}
