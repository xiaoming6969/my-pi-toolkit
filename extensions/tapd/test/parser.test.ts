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
});
