import assert from "node:assert/strict";
import test from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	lastAssistantText,
	requestRootCauseFromAgent,
	generateBugRootCauseSummary,
} from "../git/root-cause-analyze.ts";
import {
	ROOT_CAUSE_SYSTEM_PROMPT,
	buildRootCauseDelegationMessage,
	buildRootCauseTask,
} from "../git/root-cause-prompt.ts";
import {
	createFakeContext,
	createFakePi,
} from "../../shared/test/fake-extension.ts";

test("root-cause prompt asks for the three-section remark", () => {
	assert.match(ROOT_CAUSE_SYSTEM_PROMPT, /【产生原因】/);
	assert.match(ROOT_CAUSE_SYSTEM_PROMPT, /【根因大类】/);
	const withCommit = buildRootCauseTask({
		bugId: "8",
		workspaceId: "99",
		evidenceFile: "/tmp/evidence.md",
		introducedCommit: "abc1234",
	});
	assert.match(withCommit, /Bug 8/);
	assert.match(withCommit, /abc1234/);
	assert.match(
		buildRootCauseTask({
			bugId: "8",
			workspaceId: "99",
			evidenceFile: "/tmp/evidence.md",
		}),
		/未能定位引入 commit/,
	);
	const message = buildRootCauseDelegationMessage(withCommit);
	assert.match(message, /agent 为 reviewer/);
	assert.match(message, /evidence\.md/);
});

test("lastAssistantText reads the newest assistant text parts", () => {
	const entries = [
		{
			type: "message",
			message: { role: "user", content: "ignore" },
		},
		{
			type: "message",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "旧回复" }],
			},
		},
		{
			type: "custom",
			customType: "other",
			data: {},
		},
		{
			type: "message",
			message: {
				role: "assistant",
				content: [
					{ type: "thinking", text: "hidden" },
					{ type: "text", text: "【产生原因】空指针" },
				],
			},
		},
	] as SessionEntry[];
	assert.match(lastAssistantText(entries), /空指针/);
	assert.equal(lastAssistantText([]), "");
	assert.equal(
		lastAssistantText([
			{
				type: "message",
				message: { role: "assistant", content: "保留" },
			},
			{
				type: "message",
				message: { role: "user", content: "x" },
			},
			{
				type: "message",
				message: { role: "assistant", content: "   " },
			},
		] as SessionEntry[]),
		"保留",
	);
	assert.equal(
		lastAssistantText([
			{
				type: "message",
				message: {
					role: "assistant",
					content: ["【修复】加判断", { type: "text", text: "" }],
				},
			},
		] as SessionEntry[]),
		"【修复】加判断",
	);
});

test("requestRootCauseFromAgent waits for idle and returns the assistant reply", async () => {
	const { pi, messages } = createFakePi();
	const ctx = createFakeContext({
		entries: [
			{
				type: "message",
				message: {
					role: "assistant",
					content: "【产生原因】a\n【修复】b\n【根因大类】未能确定",
				},
			},
		],
	});
	let waited = false;
	ctx.waitForIdle = async () => {
		waited = true;
	};
	const output = await requestRootCauseFromAgent(pi, ctx, "task");
	assert.equal(waited, true);
	assert.equal(messages.length, 1);
	assert.match(JSON.stringify(messages[0]), /reviewer/);
	assert.match(output, /【产生原因】a/);
});

test("requestRootCauseFromAgent surfaces waitForIdle failures", async () => {
	const { pi } = createFakePi();
	const ctx = createFakeContext();
	ctx.waitForIdle = async () => {
		throw new Error("idle failed");
	};
	await assert.rejects(
		() => requestRootCauseFromAgent(pi, ctx, "task"),
		/idle failed/,
	);
});

test("requestRootCauseFromAgent aborts when the signal is already aborted", async () => {
	const { pi } = createFakePi();
	const ctx = createFakeContext();
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		() => requestRootCauseFromAgent(pi, ctx, "task", controller.signal),
		/取消/,
	);
});

test("generateBugRootCauseSummary skips analysis without a model", async () => {
	const { pi } = createFakePi();
	const ctx = createFakeContext();
	ctx.model = undefined;
	const result = await generateBugRootCauseSummary({
		pi,
		ctx,
		config: { token: "t" },
		bug: {
			kind: "bug",
			shortId: "8",
			objectId: "8",
			workspaceId: "99",
			keyword: "fix",
			name: "崩溃",
		},
		cwd: process.cwd(),
		targetBranch: "dev",
		candidate: undefined,
	});
	assert.equal(result, null);
	assert.match(ctx.notifies[0]?.message ?? "", /没有可用模型/);
});

test("generateBugRootCauseSummary throws when aborted before start", async () => {
	const { pi } = createFakePi();
	const ctx = createFakeContext();
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		() =>
			generateBugRootCauseSummary({
				pi,
				ctx,
				config: { token: "t" },
				bug: {
					kind: "bug",
					shortId: "8",
					objectId: "8",
					workspaceId: "99",
					keyword: "fix",
				},
				cwd: process.cwd(),
				targetBranch: "dev",
				candidate: undefined,
				signal: controller.signal,
			}),
		/取消/,
	);
});
