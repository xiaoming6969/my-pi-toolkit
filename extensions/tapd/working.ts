import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	WorkingCancel,
	abortError,
	isAbortError,
	withWorking,
} from "../shared/tui/working-cancel.js";

export { WorkingCancel, abortError, isAbortError };

/** 包住一段 TAPD 异步工作：显示 Working、Esc 取消，结束后清理。 */
export async function withTapdWorking<T>(
	ctx: ExtensionContext,
	key: string,
	run: (cancel: WorkingCancel | undefined) => Promise<T>,
	options?: { message?: string },
): Promise<T | undefined> {
	return withWorking(ctx, key, run, {
		notifyAbort: true,
		message: options?.message,
	});
}
