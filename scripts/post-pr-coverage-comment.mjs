#!/usr/bin/env node
/**
 * Upsert the coverage report as a pull request comment.
 * No-ops outside GitHub Actions pull_request events.
 */
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPORT_MARKER } from "./coverage-report.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function githubHeaders(token) {
	return {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
		"X-GitHub-Api-Version": "2022-11-28",
	};
}

export async function readPullRequestNumber(eventPath) {
	const event = JSON.parse(await readFile(eventPath, "utf8"));
	const number = event.pull_request?.number;
	if (!number) throw new Error("当前事件没有 pull_request.number");
	return number;
}

async function listComments(repo, issue, token) {
	const comments = [];
	for (let page = 1; page <= 10; page += 1) {
		const response = await fetch(
			`https://api.github.com/repos/${repo}/issues/${issue}/comments?per_page=100&page=${page}`,
			{ headers: githubHeaders(token) },
		);
		if (!response.ok) {
			throw new Error(`列出 PR 评论失败: ${response.status}`);
		}
		const batch = await response.json();
		comments.push(...batch);
		if (batch.length < 100) break;
	}
	return comments;
}

export async function upsertPullRequestComment(options) {
	const existing = (await listComments(options.repo, options.issue, options.token)).find(
		(comment) => String(comment.body ?? "").includes(REPORT_MARKER),
	);
	const url = existing
		? `https://api.github.com/repos/${options.repo}/issues/comments/${existing.id}`
		: `https://api.github.com/repos/${options.repo}/issues/${options.issue}/comments`;
	const response = await fetch(url, {
		method: existing ? "PATCH" : "POST",
		headers: {
			...githubHeaders(options.token),
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ body: options.body }),
	});
	if (!response.ok) {
		throw new Error(`发布 PR 评论失败: ${response.status}`);
	}
	return { id: (await response.json()).id, updated: Boolean(existing) };
}

async function postCoverageCommentFromEnv(env = process.env) {
	const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
	const repo = env.GITHUB_REPOSITORY;
	const eventPath = env.GITHUB_EVENT_PATH;
	if (!token || !repo || !eventPath) return { skipped: true, reason: "not-github" };
	const issue = await readPullRequestNumber(eventPath);
	const body = await readFile(join(root, "coverage/report.md"), "utf8");
	if (!body.includes(REPORT_MARKER)) {
		throw new Error("coverage/report.md 缺少报告标记");
	}
	return upsertPullRequestComment({ repo, token, issue, body });
}

const invokedDirectly =
	process.argv[1] !== undefined &&
	fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
	try {
		const result = await postCoverageCommentFromEnv();
		if (result.skipped) {
			console.log("跳过 PR 评论：不在 GitHub pull_request 环境中。");
		} else {
			console.log(result.updated ? `已更新评论 ${result.id}` : `已发布评论 ${result.id}`);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
