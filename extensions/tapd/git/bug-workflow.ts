import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { fetchUserInfo } from "../core/api.js";
import type { TapdConfig } from "../types.js";
import {
	fetchRemoteTags,
	linkedObjectsForCommit,
	resolveCommitTag,
} from "./analysis.js";
import {
	fetchBugMrFields,
	matchCategoryOption,
	selectCategoryOption,
	tapdUserChooser,
} from "./bug-fields.js";
import {
	renderBugRootCauseDraft,
	type BugRootCauseDraft,
} from "./root-cause-draft.js";
import {
	createBugRemark,
	fetchObjectIterationCode,
	matchBugMergeVersion,
	matchHistoricalBugMergeVersion,
	updateTapdStatus,
} from "./tapd-api.js";
import type { TapdKeyword } from "./types.js";

function resolvedIntroducedCommit(draft: BugRootCauseDraft): string | null {
	const value = draft.introducedCommit.trim();
	if (!value || /^(未能定位|无法定位|unknown|none)$/i.test(value)) return null;
	return /^[0-9a-f]{7,40}$/i.test(value) ? value : null;
}

export async function updateBugFromDraft(
	ctx: ExtensionCommandContext,
	config: TapdConfig,
	item: TapdKeyword,
	draftData: BugRootCauseDraft,
	repositoryRoot: string,
	status: string,
	currentOwner: string | undefined,
	progress: (action: string) => void,
): Promise<string[]> {
	const updates: string[] = [];
	const remark = renderBugRootCauseDraft(draftData);
	const introducedCommit = resolvedIntroducedCommit(draftData);
	const extraFields: Record<string, string> = {};
	if (introducedCommit) {
		progress("正在校验引入 commit、获取 tags 并匹配合入版本...");
		try {
			await fetchRemoteTags(repositoryRoot);
			const tagResult = await resolveCommitTag(
				repositoryRoot,
				introducedCommit,
			);
			if (tagResult.tag) {
				const linked = await linkedObjectsForCommit(
					repositoryRoot,
					tagResult.commit,
				);
				const iterationCodes = (
					await Promise.all(
						linked.map((linkedItem) =>
							fetchObjectIterationCode(config, linkedItem),
						),
					)
				).filter((code): code is string => Boolean(code));
				const version = await matchBugMergeVersion(
					config,
					item.workspaceId,
					tagResult.tag,
					iterationCodes,
				);
				let selectedVersion = version.value;
				if (!selectedVersion && version.candidates?.length) {
					selectedVersion = await ctx.ui.select(
						`Bug ${item.shortId}: ${tagResult.tag} 无法从迭代自动确定合入版本，请选择`,
						version.candidates,
					);
				}
				if (version.fieldName && selectedVersion) {
					extraFields[version.fieldName] = selectedVersion;
					updates.push(`bug/${item.shortId}: 合入版本 ${selectedVersion}`);
				} else {
					updates.push(
						`bug/${item.shortId}: 合入版本未修改 - ${version.reason}`,
					);
				}
			} else updates.push(`bug/${item.shortId}: 引入 commit 没有可用 tag`);
		} catch (error) {
			updates.push(
				`bug/${item.shortId}: commit/tag 校验失败 - ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	} else {
		progress("未能定位引入 commit，正在匹配“其他(历史缺陷)”...");
		const historical = await matchHistoricalBugMergeVersion(
			config,
			item.workspaceId,
		);
		if (historical.fieldName && historical.value) {
			extraFields[historical.fieldName] = historical.value;
			updates.push(`bug/${item.shortId}: 合入版本 ${historical.value}`);
		} else
			updates.push(
				`bug/${item.shortId}: 合入版本未修改 - ${historical.reason}`,
			);
	}
	progress("正在匹配根因大类，并写入当前用户为开发人员...");
	const fields = await fetchBugMrFields(config, item.workspaceId);
	if (fields.category) {
		let category = matchCategoryOption(
			draftData.category,
			fields.category.leaves,
		);
		let skipReason: string | undefined;
		if (!category) {
			try {
				category = await selectCategoryOption(
					fields.category.leaves,
					(title, options) => ctx.ui.select(title, options),
					{
						parent: `Bug ${item.shortId}: 请选择根因大类`,
						child: `Bug ${item.shortId}: 请选择根因子类`,
					},
				);
				if (!category) skipReason = "根因大类未修改";
			} catch (error) {
				skipReason = `根因大类未修改 - ${error instanceof Error ? error.message : String(error)}`;
			}
		}
		if (category) {
			extraFields[fields.category.fieldName] = category;
			updates.push(`bug/${item.shortId}: 根因大类 ${category}`);
		} else {
			updates.push(
				`bug/${item.shortId}: ${skipReason ?? "根因大类未修改"}`,
			);
		}
	} else {
		updates.push(
			`bug/${item.shortId}: 根因大类未修改 - 未找到字段或没有候选值`,
		);
	}
	if (fields.developerFieldName) {
		const user = await fetchUserInfo(config);
		const developer = user?.nick ? tapdUserChooser(user.nick) : "";
		if (developer) {
			extraFields[fields.developerFieldName] = developer;
			updates.push(`bug/${item.shortId}: 开发人员 ${user?.nick}`);
		} else {
			updates.push(`bug/${item.shortId}: 开发人员未修改 - 无法获取当前用户`);
		}
	} else {
		updates.push(`bug/${item.shortId}: 开发人员未修改 - 未找到字段`);
	}
	progress(`正在同步状态 ${status}、负责人、合入版本、根因大类和开发人员...`);
	await updateTapdStatus(config, item, status, currentOwner, extraFields);
	updates.push(`bug/${item.shortId} → ${status}`);
	if (!item.author) {
		updates.push(`bug/${item.shortId}: keyword 缺少 --user，未写入根因备注`);
		return updates;
	}
	progress("正在写入 Bug 根因备注...");
	const description = remark
		.replace(/\n{2,}/g, "<br/><br/>")
		.replace(/\n/g, "<br/>");
	await createBugRemark(config, item, item.author, description);
	updates.push(`bug/${item.shortId}: 已添加根因备注`);
	return updates;
}
