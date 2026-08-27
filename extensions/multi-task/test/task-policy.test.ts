import assert from "node:assert/strict";
import test from "node:test";
import { pathsOverlap, validateTasks } from "../task-policy.ts";

const cwd = process.cwd();

test("validateTasks rejects empty batches, duplicate ids, and extra tasks", () => {
	assert.throws(() => validateTasks(cwd, []), /至少需要一个任务/);
	assert.throws(
		() =>
			validateTasks(
				cwd,
				Array.from({ length: 9 }, (_, index) => ({
					id: `t${index}`,
					task: "work",
					paths: ["extensions"],
				})),
			),
		/最多允许 8 个任务/,
	);
	assert.throws(
		() =>
			validateTasks(cwd, [
				{ id: "a", task: "one", paths: ["extensions"] },
				{ id: "a", task: "two", paths: ["skills"] },
			]),
		/任务 id 重复/,
	);
});

test("implementation paths cannot overlap; research paths may", () => {
	assert.throws(
		() =>
			validateTasks(cwd, [
				{ id: "a", task: "one", paths: ["extensions/multi-task"] },
				{ id: "b", task: "two", paths: ["extensions/multi-task/index.ts"] },
			]),
		/路径冲突/,
	);
	assert.throws(
		() => validateTasks(cwd, [{ id: " ", task: "work", paths: ["extensions"] }]),
		/非空 id/,
	);
	assert.throws(
		() =>
			validateTasks(cwd, [
				{ id: "a", task: "work", paths: ["extensions"], kind: "other" as never },
			]),
		/kind 无效/,
	);
	assert.throws(
		() => validateTasks(cwd, [{ id: "a", task: "work", paths: [] }]),
		/授权写入路径/,
	);
	assert.throws(
		() =>
			validateTasks(cwd, [
				{ id: "a", task: "work", paths: [], kind: "research" },
			]),
		/检索范围/,
	);
	assert.throws(
		() => validateTasks(cwd, [{ id: "a", task: "work", paths: ["  "] }]),
		/路径不能为空/,
	);
	assert.throws(
		() =>
			validateTasks(cwd, [
				{ id: "a", task: "work", paths: ["/definitely-outside-this-workspace"] },
			]),
		/必须位于当前项目内/,
	);
	assert.ok(
		validateTasks(cwd, [
			{ id: "a", task: "one", paths: ["@extensions/multi-task"] },
		]).length === 1,
	);
	const research = validateTasks(cwd, [
		{ id: "a", task: "one", paths: ["extensions/multi-task"], kind: "research" },
		{ id: "b", task: "two", paths: ["extensions/multi-task"], kind: "research" },
	]);
	assert.equal(research.length, 2);
	assert.equal(
		pathsOverlap(
			research[0].paths[0],
			research[1].paths[0],
		),
		true,
	);
});
