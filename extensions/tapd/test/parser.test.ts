import assert from "node:assert/strict";
import test from "node:test";
import { parseDevelopmentTasks } from "../subtasks/parser.ts";

function wrap(body: string): string {
	return `intro\n<!-- TAPD_SUBTASKS_START -->\n${body}\n<!-- TAPD_SUBTASKS_END -->\n`;
}

const validTask = {
	id: "auth",
	title: "登录",
	scope: ["src/auth"],
	acceptanceCriteria: ["可登录"],
	dependencies: [],
	suggestedEffort: 2,
};

test("parseDevelopmentTasks reads a valid marked JSON block", () => {
	const tasks = parseDevelopmentTasks(
		wrap(JSON.stringify({ developmentTasks: [validTask] })),
	);
	assert.deepEqual(tasks, [validTask]);
});

test("parseDevelopmentTasks rejects missing markers, JSON, and empty lists", () => {
	assert.throws(() => parseDevelopmentTasks("# no markers"), /缺少 TAPD 子需求拆分标记/);
	assert.throws(
		() => parseDevelopmentTasks(wrap("{")),
		/不是合法 JSON/,
	);
	assert.throws(
		() => parseDevelopmentTasks(wrap(JSON.stringify({ developmentTasks: [] }))),
		/非空数组/,
	);
});

test("parseDevelopmentTasks enforces title uniqueness, limits, and dependencies", () => {
	const tooMany = Array.from({ length: 6 }, (_, index) => ({
		...validTask,
		id: `t${index}`,
		title: `任务${index}`,
	}));
	assert.throws(
		() => parseDevelopmentTasks(wrap(JSON.stringify({ developmentTasks: tooMany }))),
		/不能超过 5 个/,
	);
	assert.throws(
		() =>
			parseDevelopmentTasks(
				wrap(
					JSON.stringify({
						developmentTasks: [
							validTask,
							{ ...validTask, id: "other" },
						],
					}),
				),
			),
		/标题不能重复/,
	);
	assert.throws(
		() =>
			parseDevelopmentTasks(
				wrap(
					JSON.stringify({
						developmentTasks: [{ ...validTask, dependencies: ["不存在"] }],
					}),
				),
			),
		/无法匹配的依赖任务/,
	);
	assert.throws(
		() =>
			parseDevelopmentTasks(
				wrap(
					JSON.stringify({
						developmentTasks: [{ ...validTask, title: "", scope: [] }],
					}),
				),
			),
		/缺少标题、范围或验收标准/,
	);
	assert.throws(
		() =>
			parseDevelopmentTasks(
				wrap(JSON.stringify({ developmentTasks: [null] })),
			),
		/格式无效/,
	);
	assert.throws(
		() =>
			parseDevelopmentTasks(
				wrap(
					JSON.stringify({
						developmentTasks: [
							{ ...validTask, id: "dup" },
							{ ...validTask, id: "dup", title: "另一项" },
						],
					}),
				),
			),
		/id 不能重复/,
	);
	const optional = parseDevelopmentTasks(
		wrap(
			JSON.stringify({
				developmentTasks: [
					{
						title: "无 id",
						scope: ["src", "  ", 1],
						acceptanceCriteria: ["可测", ""],
						dependencies: "nope",
						suggestedEffort: "bad",
					},
				],
			}),
		),
	);
	assert.equal(optional[0]?.id, undefined);
	assert.deepEqual(optional[0]?.scope, ["src"]);
	assert.equal(optional[0]?.suggestedEffort, undefined);

	const filtered = parseDevelopmentTasks(
		wrap(
			JSON.stringify({
				developmentTasks: [
					{
						id: "auth",
						title: "登录",
						scope: ["src/auth"],
						acceptanceCriteria: ["可登录", 2, "  "],
						dependencies: ["auth", 3, ""],
						suggestedEffort: 2,
					},
				],
			}),
		),
	);
	assert.deepEqual(filtered[0]?.acceptanceCriteria, ["可登录"]);
	assert.deepEqual(filtered[0]?.dependencies, ["auth"]);
});
