import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { fetchUserInfo, fetchWorkspaces } from "../core/api.js";
import { loadConfig } from "../core/config.js";
import { withTapdListOverlays } from "./overlay-context.js";
import { showTable } from "./ui.js";
import { withTapdWorking, type WorkingCancel } from "../working.js";

export async function openTapdTodoList(
	ctx: ExtensionCommandContext,
	config: NonNullable<ReturnType<typeof loadConfig>>,
	initialCurrent: boolean,
	working?: WorkingCancel,
): Promise<Awaited<ReturnType<typeof showTable>> | undefined> {
	const run = async (cancel: WorkingCancel | undefined) => {
		cancel?.setMessage("Working... 正在连接 TAPD");
		const user = await fetchUserInfo(config);
		cancel?.throwIfAborted();
		if (!user) {
			ctx.ui.notify("TAPD 连接失败，请检查令牌", "error");
			return undefined;
		}
		cancel?.setMessage("Working... 正在获取工作空间");
		const workspaces = await fetchWorkspaces(user.nick, config);
		cancel?.throwIfAborted();
		if (workspaces.length === 0) {
			ctx.ui.notify("没有找到工作空间", "error");
			return undefined;
		}
		cancel?.setMessage(
			`Working... 找到 ${workspaces.length} 个工作空间，正在获取待办`,
		);
		return showTable(
			withTapdListOverlays(ctx),
			config,
			workspaces,
			initialCurrent,
			cancel,
		);
	};
	if (working) return run(working);
	return withTapdWorking(ctx, "tapd-todo-list", run);
}
