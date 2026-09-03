import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { BUILTIN_SUBAGENT_ROLES } from "../builtin.ts";
import {
	findProjectAgentsDir,
	getSubagentRole,
	loadSubagentRoles,
} from "../loader.ts";

async function tempProject(t: { after(fn: () => unknown): void }) {
	const root = await mkdtemp(join(tmpdir(), "roles-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const agents = join(root, CONFIG_DIR_NAME, "agents");
	await mkdir(join(root, "src", "deep"), { recursive: true });
	await mkdir(agents, { recursive: true });
	return { root, agents, cwd: join(root, "src", "deep") };
}

test("built-in roles are exposed with the expected capabilities", () => {
	const names = BUILTIN_SUBAGENT_ROLES.map((role) => role.name);
	assert.deepEqual(names, ["explore", "plan", "implement", "review"]);
	const byName = new Map(BUILTIN_SUBAGENT_ROLES.map((role) => [role.name, role]));
	assert.equal(byName.get("explore")?.capability, "read-only");
	assert.equal(byName.get("explore")?.repoSearchGuard, true);
	assert.equal(byName.get("plan")?.capability, "read-only");
	assert.equal(byName.get("implement")?.capability, "all");
	assert.equal(byName.get("implement")?.resources, "inherit");
	assert.equal(byName.get("review")?.capability, "execute");
});

test("project agents shadow user roles which shadow built-ins", async (t) => {
	const { agents, cwd } = await tempProject(t);
	await writeFile(
		join(agents, "review.md"),
		"---\ndescription: Project reviewer\ncapability: read-only\n---\nProject prompt\n",
	);
	await writeFile(join(agents, "docs-writer.md"), "Write docs.\n");
	await writeFile(join(agents, "notes.txt"), "ignored");
	const roles = loadSubagentRoles({
		cwd,
		projectTrusted: true,
		userConfig: {
			subagents: {
				roles: {
					review: { prompt: "User reviewer", capability: "execute" },
					tester: { prompt: "Run tests", capability: "execute" },
				},
			},
		},
		userConfigPath: "/cfg/ming-core.json",
	});
	assert.equal(roles.get("review")?.source, "project");
	assert.equal(roles.get("review")?.capability, "read-only");
	assert.equal(roles.get("review")?.systemPrompt, "Project prompt");
	assert.equal(roles.get("tester")?.source, "user");
	assert.equal(roles.get("docs-writer")?.systemPrompt, "Write docs.");
	assert.equal(roles.get("explore")?.source, "builtin");
	assert.equal(roles.has("notes"), false);
});

test("untrusted projects contribute no roles", async (t) => {
	const { agents, cwd } = await tempProject(t);
	await writeFile(join(agents, "review.md"), "Project prompt\n");
	const roles = loadSubagentRoles({
		cwd,
		projectTrusted: false,
		userConfig: {},
		userConfigPath: "/cfg/ming-core.json",
	});
	assert.equal(roles.get("review")?.source, "builtin");
	assert.equal(findProjectAgentsDir(cwd), agents);
	assert.equal(findProjectAgentsDir(tmpdir()), undefined);
});

test("invalid user role sections fail loudly", () => {
	const options = { cwd: tmpdir(), projectTrusted: false, userConfigPath: "/cfg/x.json" };
	assert.throws(
		() => loadSubagentRoles({ ...options, userConfig: { subagents: [] } }),
		/subagents 必须是 JSON 对象/,
	);
	assert.throws(
		() =>
			loadSubagentRoles({
				...options,
				userConfig: { subagents: { roles: { bad: "prompt" } } },
			}),
		/roles\.bad 必须是 JSON 对象/,
	);
});

test("subagents.roleModels routes any role to a model without redefining it", () => {
	const base = { cwd: tmpdir(), projectTrusted: false, userConfigPath: "/cfg/x.json" };
	const roles = loadSubagentRoles({
		...base,
		userConfig: {
			subagents: {
				roles: { tester: { prompt: "t", capability: "execute", model: "role/model" } },
				roleModels: { explore: "cheap/model", tester: "routed/model" },
			},
		},
	});
	assert.equal(roles.get("explore")?.model, "cheap/model");
	assert.equal(roles.get("explore")?.source, "builtin");
	assert.equal(roles.get("tester")?.model, "routed/model");
	assert.equal(roles.get("plan")?.model, undefined);
	assert.throws(
		() =>
			loadSubagentRoles({
				...base,
				userConfig: { subagents: { roleModels: { explore: "" } } },
			}),
		/roleModels\.explore 必须是非空模型名称/,
	);
	assert.throws(
		() =>
			loadSubagentRoles({
				...base,
				userConfig: { subagents: { roleModels: { ghost: "m" } } },
			}),
		/roleModels\.ghost 指向不存在的角色/,
	);
});

test("getSubagentRole lists available roles for unknown names", () => {
	const options = {
		cwd: tmpdir(),
		projectTrusted: false,
		userConfig: {},
		userConfigPath: "/cfg/x.json",
	};
	assert.equal(getSubagentRole(" plan ", options).name, "plan");
	assert.throws(
		() => getSubagentRole("ghost", options),
		/未知的子 Agent 角色 "ghost"，可用角色: explore, plan, implement, review/,
	);
});
