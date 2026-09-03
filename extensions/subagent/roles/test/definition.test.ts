import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildRoleDefinition, parseAgentMarkdown } from "../definition.ts";

const base = {
	name: "reviewer",
	source: "user" as const,
	origin: "test",
	baseDir: "/tmp",
};

test("buildRoleDefinition applies defaults and normalizes fields", () => {
	const role = buildRoleDefinition({
		...base,
		fields: { prompt: "  Be strict.  ", tools: "git_diff, lsp_diagnostics" },
	});
	assert.equal(role.capability, "read-only");
	assert.equal(role.resources, "lean");
	assert.equal(role.systemPrompt, "Be strict.");
	assert.deepEqual(role.extraTools, ["git_diff", "lsp_diagnostics"]);
	assert.equal(role.contextFiles, true);
	assert.equal(role.repoSearchGuard, false);
	assert.equal(role.description, "");
	assert.equal(role.source, "user");
});

test("capability all defaults to inherit resources; explicit resources win", () => {
	const inherit = buildRoleDefinition({
		...base,
		fields: { prompt: "x", capability: "all" },
	});
	assert.equal(inherit.resources, "inherit");
	const lean = buildRoleDefinition({
		...base,
		fields: { prompt: "x", capability: "all", resources: "lean" },
	});
	assert.equal(lean.resources, "lean");
});

test("markdown body and promptFile provide the prompt", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "role-def-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	await writeFile(join(dir, "prompt.md"), "From file\n");
	assert.equal(
		buildRoleDefinition({ ...base, baseDir: dir, fields: { promptFile: "prompt.md" } })
			.systemPrompt,
		"From file",
	);
	assert.equal(
		buildRoleDefinition({ ...base, fields: {}, body: "\nBody prompt\n" })
			.systemPrompt,
		"Body prompt",
	);
	assert.throws(
		() =>
			buildRoleDefinition({
				...base,
				baseDir: dir,
				fields: { promptFile: "missing.md" },
			}),
		/无法读取 promptFile/,
	);
});

test("buildRoleDefinition rejects invalid names, capabilities, resources and tools", () => {
	assert.throws(
		() => buildRoleDefinition({ ...base, name: "Bad Name", fields: { prompt: "x" } }),
		/角色名/,
	);
	assert.throws(
		() => buildRoleDefinition({ ...base, fields: { prompt: "x", capability: "root" } }),
		/capability/,
	);
	assert.throws(
		() => buildRoleDefinition({ ...base, fields: { prompt: "x", resources: "full" } }),
		/resources/,
	);
	assert.throws(
		() => buildRoleDefinition({ ...base, fields: { prompt: "x", tools: [1] } }),
		/tools/,
	);
	assert.throws(
		() => buildRoleDefinition({ ...base, fields: { prompt: "x", tools: 42 } }),
		/tools/,
	);
	assert.throws(
		() => buildRoleDefinition({ ...base, fields: { prompt: "", model: "m" } }),
		/prompt 必须是非空字符串/,
	);
	assert.throws(() => buildRoleDefinition({ ...base, fields: {} }), /prompt/);
});

test("outputs declare files the role must produce", () => {
	const role = buildRoleDefinition({
		...base,
		fields: {
			prompt: "x",
			outputs: [
				{ name: "plan.md", description: "The plan", required: true },
				{ name: "notes.md" },
			],
		},
	});
	assert.deepEqual(role.outputs, [
		{ name: "plan.md", description: "The plan", required: true },
		{ name: "notes.md", description: "", required: false },
	]);
	assert.deepEqual(buildRoleDefinition({ ...base, fields: { prompt: "x" } }).outputs, []);
	assert.throws(
		() => buildRoleDefinition({ ...base, fields: { prompt: "x", outputs: "plan.md" } }),
		/outputs 必须是数组/,
	);
	assert.throws(
		() => buildRoleDefinition({ ...base, fields: { prompt: "x", outputs: ["plan.md"] } }),
		/每一项必须是对象/,
	);
	assert.throws(
		() => buildRoleDefinition({ ...base, fields: { prompt: "x", outputs: [{ name: "../x" }] } }),
		/合法文件名/,
	);
});

test("parseAgentMarkdown splits YAML frontmatter from the body", () => {
	const parsed = parseAgentMarkdown(
		"---\nname: tester\ncapability: execute\ntools:\n  - lsp_diagnostics\n---\nRun the tests.\n",
		"agents/tester.md",
	);
	assert.deepEqual(parsed.fields, {
		name: "tester",
		capability: "execute",
		tools: ["lsp_diagnostics"],
	});
	assert.equal(parsed.body, "Run the tests.\n");
	assert.deepEqual(parseAgentMarkdown("Just a prompt", "x"), {
		fields: {},
		body: "Just a prompt",
	});
	assert.deepEqual(parseAgentMarkdown("---\n---\nBody", "x").fields, {});
	assert.throws(() => parseAgentMarkdown("---\n- a\n---\nBody", "x"), /键值映射/);
	assert.throws(() => parseAgentMarkdown("---\nkey: [\n---\nBody", "x"), /YAML/);
});
