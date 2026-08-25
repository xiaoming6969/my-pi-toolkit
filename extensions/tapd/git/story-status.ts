import type { TapdStoryDetail } from "../core/api.js";

export const DEVELOPMENT_COMPLETE = "开发完成";
export const TEST_PASSED = "已通过";
const IN_PROGRESS = "实现中";

export function isOwnedBy(owner: string | undefined, nick: string): boolean {
	return (owner ?? "")
		.split(/[;,，]/)
		.map((value) => value.trim())
		.filter(Boolean)
		.includes(nick);
}

export function functionalStoryStatus(
	children: TapdStoryDetail[],
	nick: string,
	developmentTypeId: string,
	testTypeId?: string,
): string {
	const unfinishedByOthers = children.some((child) => {
		if (isOwnedBy(child.owner, nick)) return false;
		const status = child.v_status ?? child.status;
		if (child.workitem_type_id === developmentTypeId)
			return status !== DEVELOPMENT_COMPLETE;
		return child.workitem_type_id === testTypeId && status !== TEST_PASSED;
	});
	return unfinishedByOthers ? IN_PROGRESS : DEVELOPMENT_COMPLETE;
}
