import assert from "node:assert/strict";
import test from "node:test";
import { fetchOpenAiModels } from "../fetch-models.ts";

test("fetchOpenAiModels maps ids and drops incomplete rows", async (t) => {
	t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
		assert.equal(String(input), "https://api.example.com/v1/models");
		assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret");
		return new Response(
			JSON.stringify({
				data: [
					{ id: " gpt-x ", name: " GPT " },
					{ id: "  " },
					{ id: 12 },
					{
						id: "plain",
						context_window: 8_000,
						max_tokens: 1_024,
					},
				],
			}),
			{ status: 200 },
		);
	});
	assert.deepEqual(await fetchOpenAiModels("https://api.example.com/v1/", "secret"), [
		{ id: "gpt-x", name: "GPT", context_window: undefined, max_tokens: undefined },
		{ id: "plain", name: undefined, context_window: 8_000, max_tokens: 1_024 },
	]);
});

test("fetchOpenAiModels rejects HTTP errors", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () => new Response("nope", { status: 401, statusText: "Unauthorized" }),
	);
	await assert.rejects(() => fetchOpenAiModels("https://api.example.com", "k"), /HTTP 401/);
});

test("fetchOpenAiModels rejects a payload without data", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () => new Response(JSON.stringify({}), { status: 200 }),
	);
	await assert.rejects(() => fetchOpenAiModels("https://api.example.com", "k"), /缺少 data 数组/);
});
