import assert from "node:assert/strict";
import test from "node:test";
import { apiUrl, tapdGet, tapdPost, tapdPut } from "../core/http.ts";
import { longTapdObjectId } from "../core/object-id.ts";
import { DEFAULT_TAPD_API_BASE } from "../core/config.ts";

const config = { token: "secret", baseUrl: "https://tapd.example/" };

test("longTapdObjectId pads short numeric ids and leaves others unchanged", () => {
	assert.equal(longTapdObjectId("99", "12"), "1199000000012");
	assert.equal(longTapdObjectId("99", "123456789"), "1199123456789");
	assert.equal(longTapdObjectId("99", "abc"), "abc");
	assert.equal(longTapdObjectId("99", "1234567890"), "1234567890");
});

test("apiUrl strips trailing slashes and encodes query values", () => {
	assert.equal(apiUrl(config, "/stories"), "https://tapd.example/stories");
	assert.equal(
		apiUrl({ token: "t" }, "/stories"),
		`${DEFAULT_TAPD_API_BASE}/stories`,
	);
	assert.equal(
		apiUrl(config, "/stories", { workspace_id: "99", q: "a b" }),
		"https://tapd.example/stories?workspace_id=99&q=a+b",
	);
});

test("tapdGet accepts status 1 payloads", async (t) => {
	t.mock.method(globalThis, "fetch", async (_input: string | URL, init?: RequestInit) => {
		assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret");
		return new Response(JSON.stringify({ status: 1, data: { ok: true } }), { status: 200 });
	});
	assert.deepEqual(await tapdGet<{ status: number; data: { ok: boolean } }>(
		"https://tapd.example/x",
		config,
	), { status: 1, data: { ok: true } });
});

test("tapdGet returns null on non-OK HTTP", async (t) => {
	t.mock.method(globalThis, "fetch", async () => new Response("nope", { status: 500 }));
	assert.equal(await tapdGet("https://tapd.example/x", config), null);
});

test("tapdGet returns null when TAPD status is not success", async (t) => {
	t.mock.method(
		globalThis,
		"fetch",
		async () => new Response(JSON.stringify({ status: 0 }), { status: 200 }),
	);
	assert.equal(await tapdGet("https://tapd.example/x", config), null);
});

test("tapdGet returns null on AbortError", async (t) => {
	t.mock.method(globalThis, "fetch", async () => {
		const error = new Error("aborted");
		error.name = "AbortError";
		throw error;
	});
	assert.equal(await tapdGet("https://tapd.example/x", config), null);
});

test("tapdPost sends JSON and treats missing status as success", async (t) => {
	t.mock.method(globalThis, "fetch", async (_input, init?: RequestInit) => {
		assert.equal(init?.method, "POST");
		assert.equal(init?.body, JSON.stringify({ id: "1" }));
		return new Response(JSON.stringify({ data: true }), { status: 200 });
	});
	assert.deepEqual(await tapdPost("https://tapd.example/x", config, { id: "1" }), {
		data: true,
	});
});

test("tapdPut returns null on network errors other than abort", async (t) => {
	t.mock.method(globalThis, "fetch", async () => {
		throw new Error("offline");
	});
	assert.equal(await tapdPut("https://tapd.example/x", config, { id: "1" }), null);
});
