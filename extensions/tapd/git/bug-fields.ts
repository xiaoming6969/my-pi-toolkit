import type { TapdConfig } from "../types.js";
import { apiUrl, tapdGet } from "../core/http.js";

interface TapdDataResponse<T> {
	status: number;
	data: T;
}

interface BugFieldInfo {
	name: string;
	label: string;
	options?: unknown;
}

const ROOT_CAUSE_CATEGORY_LABEL = "根因大类";
const DEVELOPER_FIELD_LABEL = "开发人员";

export interface CategoryLeaf {
	label: string;
	value: string;
	path: string[];
}

interface BugMrFields {
	category?: { fieldName: string; leaves: CategoryLeaf[] };
	developerFieldName?: string;
}

function optionText(value: unknown): string | undefined {
	if (typeof value === "string") {
		const text = value.trim();
		return text || undefined;
	}
	if (!value || typeof value !== "object" || Array.isArray(value))
		return undefined;
	const record = value as Record<string, unknown>;
	return (
		optionText(record.value) ??
		optionText(record.label) ??
		optionText(record.name)
	);
}

function toLeaf(path: string[]): CategoryLeaf {
	return { label: path.join(" / "), value: path.join("/"), path };
}

function flattenCascade(options: unknown, prefix: string[] = []): CategoryLeaf[] {
	if (!Array.isArray(options)) return [];
	return options.flatMap((item) => {
		if (typeof item === "string") {
			const name = item.trim();
			return name ? [toLeaf([...prefix, name])] : [];
		}
		const name = optionText(item);
		if (!name) return [];
		const children =
			item && typeof item === "object" && "children" in item
				? (item as { children?: unknown }).children
				: undefined;
		if (Array.isArray(children) && children.length > 0)
			return flattenCascade(children, [...prefix, name]);
		return [toLeaf([...prefix, name])];
	});
}

function flatOptions(options: BugFieldInfo["options"]): CategoryLeaf[] {
	const cascade = flattenCascade(options);
	if (cascade.length > 0) return cascade;
	if (!options) return [];
	if (typeof options === "string") {
		return options
			.split("|")
			.map((value) => value.trim())
			.filter(Boolean)
			.map((name) => toLeaf([name]));
	}
	if (typeof options === "object" && !Array.isArray(options)) {
		return Object.keys(options as Record<string, unknown>).flatMap((key) => {
			const name = optionText(key);
			return name ? [toLeaf([name])] : [];
		});
	}
	return [];
}

function findByLabel(
	fields: Record<string, BugFieldInfo>,
	label: string,
): BugFieldInfo | undefined {
	return Object.values(fields).find((field) => field.label === label);
}

export async function fetchBugMrFields(
	config: TapdConfig,
	workspaceId: string,
	signal?: AbortSignal,
): Promise<BugMrFields> {
	const response = await tapdGet<
		TapdDataResponse<Record<string, BugFieldInfo>>
	>(
		apiUrl(config, "/bugs/get_fields_info", { workspace_id: workspaceId }),
		config,
		signal,
	);
	const fields = response?.data;
	if (!fields) return {};
	const category = findByLabel(fields, ROOT_CAUSE_CATEGORY_LABEL);
	const developer = findByLabel(fields, DEVELOPER_FIELD_LABEL);
	const leaves = category?.name ? flatOptions(category.options) : [];
	return {
		category:
			category?.name && leaves.length > 0
				? { fieldName: category.name, leaves }
				: undefined,
		developerFieldName: developer?.name,
	};
}

function normalizeCategoryText(value: string): string {
	return value.trim().replace(/\s*\/\s*/g, "/");
}

export function matchCategoryOption(
	value: string | undefined,
	leaves: CategoryLeaf[],
): string | undefined {
	const trimmed = value?.trim() ?? "";
	if (!trimmed || /^(未能确定|无法确定|unknown|none)$/i.test(trimmed))
		return undefined;
	const normalized = normalizeCategoryText(trimmed);
	const exact = leaves.find(
		(leaf) => leaf.label === trimmed || leaf.value === normalized,
	);
	if (exact) return exact.value;
	const childHits = leaves.filter((leaf) => leaf.path.at(-1) === trimmed);
	return childHits.length === 1 ? childHits[0].value : undefined;
}

export async function selectCategoryOption(
	leaves: CategoryLeaf[],
	select: (title: string, options: string[]) => Promise<string | undefined>,
	titles: { parent: string; child: string },
): Promise<string | undefined> {
	const parents = [...new Set(leaves.map((leaf) => leaf.path[0]).filter(Boolean))];
	const parent =
		parents.length === 1 ? parents[0] : await select(titles.parent, parents);
	if (!parent) return undefined;
	const group = leaves.filter((leaf) => leaf.path[0] === parent);
	if (group.length === 1) return group[0].value;
	const childLabels = group.map((leaf) => leaf.path.slice(1).join(" / "));
	const child = await select(titles.child, childLabels);
	if (!child) return undefined;
	return group.find((leaf) => leaf.path.slice(1).join(" / ") === child)?.value;
}

export function tapdUserChooser(nick: string): string {
	const value = nick.trim().replace(/;+$/, "");
	return value ? `${value};` : "";
}
