import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { requestTapdReview } from "../review/command.ts";
import { buildReviewDelegationMessage } from "../review/prompt.ts";
import {
	createFakeContext,
	createFakePi,
} from "../../shared/test/fake-extension.ts";
import { TAPD_SESSION_STATE_TYPE } from "../sessions/session-state.ts";

function storyLink(overrides: Record<string, unknown> = {}) {
	return {
		type: "custom" as const,
		customType: TAPD_SESSION_STATE_TYPE,
		data: {
			version: 1,
			workspaceId: "1",
			itemId: "12",
			kind: "story",
			itemName: "登录",
			createdAt: "t",
			updatedAt: "t",
			...overrides,
		},
	};
}

async function withDocs(
	run: (cwd: string) => Promise<void>,
	options?: { emptyUnderstanding?: boolean },
): Promise<void> {
	const cwd = await mkdtemp(join(tmpdir(), "tapd-review-"));
	try {
		const dir = join(cwd, ".pi", "docs", "story-12");
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, "understanding.md"),
			options?.emptyUnderstanding ? "  \n" : "# 理解\n",
		);
		await writeFile(join(dir, "design.md"), "# 设计\n");
		await run(cwd);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
}

function messageText(messages: unknown[]): string {
	const first = messages[0] as { content?: string } | undefined;
	return first?.content ?? JSON.stringify(messages[0] ?? "");
}

test("requestTapdReview requires an idle agent and valid --base", async () => {
	const { pi, messages } = createFakePi();
	const busy = createFakeContext({ isIdle: false });
	await requestTapdReview(pi, busy, []);
	assert.match(busy.notifies[0]?.message ?? "", /请稍后再运行/);

	const ctx = createFakeContext({ hasUI: false });
	await requestTapdReview(pi, ctx, ["--base"]);
	assert.match(ctx.notifies[0]?.message ?? "", /--base 需要指定/);
	assert.equal(messages.length, 0);
});

test("requestTapdReview fails without a TAPD story session", async () => {
	const { pi, messages } = createFakePi();
	const ctx = createFakeContext({ hasUI: false });
	await requestTapdReview(pi, ctx, []);
	assert.match(ctx.notifies[0]?.message ?? "", /没有关联 TAPD 需求/);
	assert.equal(messages.length, 0);
});

test("requestTapdReview rejects bug sessions", async () => {
	const { pi, messages } = createFakePi();
	const ctx = createFakeContext({
		hasUI: false,
		entries: [storyLink({ kind: "bug", itemName: "崩溃" })],
	});
	await requestTapdReview(pi, ctx, []);
	assert.match(ctx.notifies[0]?.message ?? "", /不支持 Bug 会话/);
	assert.equal(messages.length, 0);
});

test("requestTapdReview fails when documents are missing or empty", async () => {
	const { pi, messages } = createFakePi();
	const missing = createFakeContext({
		hasUI: false,
		cwd: join(tmpdir(), "tapd-review-missing"),
		entries: [storyLink()],
	});
	await requestTapdReview(pi, missing, []);
	assert.match(missing.notifies[0]?.message ?? "", /未找到/);
	assert.equal(messages.length, 0);

	await withDocs(async (cwd) => {
		const empty = createFakeContext({
			hasUI: false,
			cwd,
			entries: [storyLink()],
		});
		await requestTapdReview(pi, empty, []);
		assert.match(empty.notifies[0]?.message ?? "", /为空/);
	}, { emptyUnderstanding: true });
	assert.equal(messages.length, 0);
});

test("requestTapdReview injects reviewer with TAPD paths and does not mention tapd_review", async () => {
	const { pi, messages } = createFakePi();
	await withDocs(async (cwd) => {
		const ctx = createFakeContext({
			hasUI: false,
			cwd,
			entries: [storyLink()],
		});
		await requestTapdReview(pi, ctx, ["--base", "origin/main", "注意边界"]);
		assert.equal(messages.length, 1);
		const text = messageText(messages);
		assert.match(text, /agent 为 reviewer/);
		assert.match(text, /story-12/);
		assert.match(text, /understanding\.md/);
		assert.match(text, /design\.md/);
		assert.match(text, /origin\/main/);
		assert.match(text, /注意边界/);
		assert.doesNotMatch(text, /tapd_review/);
	});
});

test("requestTapdReview uses the first UI scope choice", async () => {
	const { pi, messages } = createFakePi();
	await withDocs(async (cwd) => {
		const ctx = createFakeContext({
			hasUI: true,
			cwd,
			entries: [storyLink()],
		});
		await requestTapdReview(pi, ctx, []);
		assert.equal(messages.length, 1);
		assert.match(messageText(messages), /仅审核未提交修改/);
	});
});

test("requestTapdReview uses sibling design.md when understandingFile is set", async () => {
	const { pi, messages } = createFakePi();
	const cwd = await mkdtemp(join(tmpdir(), "tapd-review-custom-"));
	try {
		const dir = join(cwd, "docs");
		await mkdir(dir, { recursive: true });
		const understandingFile = join(dir, "understanding.md");
		await writeFile(understandingFile, "# 理解\n");
		await writeFile(join(dir, "design.md"), "# 设计\n");
		const ctx = createFakeContext({
			hasUI: false,
			cwd,
			entries: [storyLink({ understandingFile })],
		});
		await requestTapdReview(pi, ctx, []);
		assert.equal(messages.length, 1);
		assert.match(messageText(messages), /docs[/\\]understanding\.md/);
		assert.match(messageText(messages), /docs[/\\]design\.md/);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("buildReviewDelegationMessage describes uncommitted and branch scopes", () => {
	const target = {
		storyId: "12",
		storyName: "登录",
		understandingFile: "/u.md",
		designFile: "/d.md",
	};
	const uncommitted = buildReviewDelegationMessage({
		target,
		scope: "uncommitted",
		baseRef: "origin/dev",
	});
	assert.match(uncommitted, /reviewer/);
	assert.match(uncommitted, /\/u\.md/);
	assert.match(uncommitted, /仅审核未提交修改/);
	assert.doesNotMatch(uncommitted, /tapd_review/);
	assert.doesNotMatch(uncommitted, /补充要求/);

	const branched = buildReviewDelegationMessage({
		target,
		scope: "branch",
		baseRef: "origin/dev",
		instructions: "extra",
	});
	assert.match(branched, /相对 origin\/dev/);
	assert.match(branched, /补充要求：extra/);
});
