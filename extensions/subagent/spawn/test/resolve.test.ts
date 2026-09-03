import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { withTempAgentDir } from "../../../shared/test/fake-extension.ts";
import { BUILTIN_SUBAGENT_ROLES } from "../../roles/builtin.ts";
import { userConfigPath } from "../../repo-search/config.ts";
import { resolveSpawnCwd, resolveSpawnTarget } from "../resolve.ts";

const role = (name: string) =>
	BUILTIN_SUBAGENT_ROLES.find((item) => item.name === name)!;
const current = { provider: "openai", id: "gpt" };

test("resolveSpawnCwd keeps the parent cwd, resolves relative paths and rejects missing dirs", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		await mkdir(join(dir, "pkg"));
		assert.equal(resolveSpawnCwd(dir), dir);
		assert.equal(resolveSpawnCwd(dir, "  "), dir);
		assert.equal(resolveSpawnCwd(dir, "pkg"), join(dir, "pkg"));
		assert.equal(resolveSpawnCwd("/elsewhere", join(dir, "pkg")), join(dir, "pkg"));
		assert.throws(() => resolveSpawnCwd(dir, "nope"), /cwd 不是已存在的目录/);
	});
});

test("role model override wins over everything", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		const target = resolveSpawnTarget({
			role: { ...role("review"), model: "role/model" },
			cwd: dir,
			projectTrusted: true,
			currentModel: current,
		});
		assert.deepEqual(target, { model: "role/model", modelSource: "role" });
	});
});

test("explore follows the Repo Search configuration, other roles use the current model", async (t) => {
	await withTempAgentDir(t, async (dir) => {
		await writeFile(
			userConfigPath(),
			JSON.stringify({ repoSearch: { model: "user/search", presentation: "inline" } }),
		);
		const explore = resolveSpawnTarget({
			role: role("explore"),
			cwd: dir,
			projectTrusted: false,
			currentModel: current,
		});
		assert.deepEqual(explore, {
			model: "user/search",
			modelSource: "user",
			presentation: "inline",
		});
		const plan = resolveSpawnTarget({
			role: role("plan"),
			cwd: dir,
			projectTrusted: false,
			currentModel: current,
		});
		assert.deepEqual(plan, { model: "openai/gpt", modelSource: "current" });
		assert.throws(
			() =>
				resolveSpawnTarget({
					role: role("plan"),
					cwd: dir,
					projectTrusted: false,
					currentModel: undefined,
				}),
			/未配置模型/,
		);
	});
});
