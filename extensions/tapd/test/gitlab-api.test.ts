import assert from "node:assert/strict";
import test from "node:test";
import { createOrUpdateMergeRequest, parseGitLabProject } from "../git/gitlab-api.ts";

test("createOrUpdateMergeRequest posts a new MR and updates drafts in place", async (t) => {
	const project = parseGitLabProject("git@gitlab.example.com:group/app.git");
	const calls: Array<{ url: string; method: string; token?: string; body?: string }> = [];

	t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		const headers = init?.headers as Record<string, string> | undefined;
		calls.push({
			url,
			method,
			token: headers?.["PRIVATE-TOKEN"],
			body: typeof init?.body === "string" ? init.body : undefined,
		});
		if (method === "GET") {
			const existing = url.includes("source_branch=feature")
				? []
				: [{ iid: 9, web_url: "u", title: "old", labels: [] }];
			return new Response(JSON.stringify(existing), { status: 200 });
		}
		return new Response(
			JSON.stringify({ iid: 9, web_url: "u", title: "ok", labels: ["二组"] }),
			{ status: 200 },
		);
	});

	await createOrUpdateMergeRequest(project, "token", {
		sourceBranch: "feature",
		targetBranch: "dev",
		title: "Draft: Work",
		labels: ["二组"],
		removeSourceBranch: true,
		draft: true,
	});
	assert.equal(calls[0]?.token, "token");
	assert.equal(calls[1]?.method, "POST");
	assert.match(calls[1]?.body ?? "", /"title":"Draft: Work"/);

	calls.length = 0;
	const updated = await createOrUpdateMergeRequest(project, "token", {
		sourceBranch: "bug/1",
		targetBranch: "dev",
		title: "WIP: Fix",
		labels: ["二组"],
		removeSourceBranch: false,
		draft: false,
	});
	assert.equal(calls[1]?.method, "PUT");
	assert.match(calls[1]?.url ?? "", /merge_requests\/9$/);
	assert.match(calls[1]?.body ?? "", /"title":"Fix"/);
	assert.equal(updated.iid, 9);
});

test("createOrUpdateMergeRequest surfaces GitLab HTTP errors", async (t) => {
	t.mock.method(globalThis, "fetch", async () => new Response("nope", { status: 500 }));
	await assert.rejects(
		() =>
			createOrUpdateMergeRequest(
				parseGitLabProject("https://gitlab.example.com/group/app.git"),
				"token",
				{
					sourceBranch: "a",
					targetBranch: "dev",
					title: "x",
					labels: [],
					removeSourceBranch: true,
					draft: false,
				},
			),
		/GitLab API 500/,
	);
});
