import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { ensureCompanionPackages } from "./install.js";
import { COMPANION_NPM_PACKAGES } from "./catalog.js";
import { configuredCompanionNames } from "./settings.js";

function notifyResult(
	ctx: ExtensionContext,
	installed: string[],
	failed: Array<{ spec: string; error: string }>,
	skippedOffline: boolean,
	reloaded: boolean,
): void {
	if (!ctx.hasUI) return;
	if (skippedOffline) {
		ctx.ui.notify(
			"离线模式：未自动安装 ponytail / pi-lens。联网后重启 Pi 或执行 pi install npm:pi-lens",
			"warning",
		);
		return;
	}
	if (installed.length > 0) {
		const names = installed.join("、");
		const next = reloaded ? "" : " 请执行 /reload 加载。";
		ctx.ui.notify(
			`已安装 ${names}。之后用 pi update --extensions 更新。${next}`,
			"info",
		);
	}
	for (const item of failed) {
		ctx.ui.notify(`未能安装 ${item.spec}：${item.error}`, "warning");
	}
}

async function tryReload(ctx: ExtensionContext): Promise<boolean> {
	const reload = (ctx as ExtensionCommandContext).reload;
	if (typeof reload !== "function") return false;
	await reload.call(ctx);
	return true;
}

export default function companionPackages(pi: ExtensionAPI): void {
	let ensuring: Promise<void> | undefined;

	pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
		if (ensuring) {
			await ensuring;
			return;
		}
		ensuring = (async () => {
			const configured = await configuredCompanionNames(ctx.cwd);
			const missing = COMPANION_NPM_PACKAGES.some(
				(pkg) => !configured.has(pkg.name),
			);
			if (!missing) return;
			if (ctx.hasUI) {
				ctx.ui.setStatus("companions", "installing ponytail / pi-lens");
			}
			try {
				const result = await ensureCompanionPackages(pi, ctx.cwd);
				if (ctx.hasUI) ctx.ui.setStatus("companions", undefined);
				const reloaded =
					result.installed.length > 0 ? await tryReload(ctx) : false;
				notifyResult(
					ctx,
					result.installed,
					result.failed,
					result.skippedOffline,
					reloaded,
				);
			} catch (error) {
				if (ctx.hasUI) ctx.ui.setStatus("companions", undefined);
				const message = error instanceof Error ? error.message : String(error);
				if (ctx.hasUI) {
					ctx.ui.notify(`自动安装第三方 Pi 包失败：${message}`, "warning");
				}
			}
		})();
		await ensuring;
		ensuring = undefined;
	});
}
