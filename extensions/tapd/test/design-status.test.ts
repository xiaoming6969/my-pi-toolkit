import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getDesignDocPath } from "../sessions/docs.ts";
import { linkKey } from "../sessions/keys.ts";
import { collectDesignedStoryKeys } from "../todo/design-status.ts";
import type { TapdItem } from "../types.ts";

function story(id: string, children: TapdItem[] = []): TapdItem {
	return {
		id,
		kind: "story",
		name: id,
		status: "实现中",
		priority: "高",
		owner: "me",
		workspaceId: "ws",
		workspaceName: "ws",
		children,
		depth: 0,
		hasChildren: children.length > 0,
	};
}

test("collectDesignedStoryKeys only includes stories with a local design.md", async (t) => {
	const cwd = await mkdtemp(join(tmpdir(), "tapd-design-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	const designPath = getDesignDocPath(cwd, "story-1");
	await mkdir(dirname(designPath), { recursive: true });
	await writeFile(designPath, "# design\n");

	const forest = [
		story("1", [story("2")]),
		{
			...story("9"),
			kind: "bug" as const,
		},
	];
	const designed = collectDesignedStoryKeys(forest, cwd);
	assert.deepEqual([...designed], [linkKey("ws", "1", "story")]);
	assert.equal(designed.has(linkKey("ws", "2", "story")), false);
});
