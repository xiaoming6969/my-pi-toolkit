import assert from "node:assert/strict";
import test from "node:test";
import { formatSearchResults, queryDocs, searchLibraries } from "../api.ts";

test("formatSearchResults explains an empty match list", () => {
  assert.equal(formatSearchResults([]), "未找到匹配的库。");
});

test("formatSearchResults prints id, description, scores, and versions", () => {
  const text = formatSearchResults([
    {
      id: "/org/lib",
      title: "Lib",
      description: "示例库",
      trustScore: 90,
      benchmarkScore: 80,
      stars: 12,
      versions: ["1.0.0", "1.1.0", "2.0.0", "2.1.0", "2.2.0", "3.0.0"],
    },
    {
      id: "/org/other",
      title: "Other",
      description: "无指标",
    },
  ]);
  assert.match(text, /1\. Lib/);
  assert.match(text, /ID: \/org\/lib/);
  assert.match(text, /描述: 示例库/);
  assert.match(text, /信任分 90 \| 基准分 80 \| stars 12/);
  assert.match(text, /版本: 1\.0\.0, 1\.1\.0, 2\.0\.0, 2\.1\.0, 2\.2\.0/);
  assert.doesNotMatch(text, /3\.0\.0/);
  assert.match(text, /2\. Other/);
  assert.doesNotMatch(text, /2\. Other[\s\S]*指标:/);
});

test("searchLibraries sends auth and returns results", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://context7.com");
    assert.equal(url.searchParams.get("libraryName"), "react");
    assert.equal(url.searchParams.get("query"), "hooks");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer k");
    return new Response(
      JSON.stringify({
        results: [{ id: "/org/react", title: "React", description: "ui" }],
      }),
      { status: 200 },
    );
  });
  const results = await searchLibraries("react", "hooks", "k");
  assert.equal(results[0]?.id, "/org/react");
});

test("searchLibraries treats missing results as empty", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify({}), { status: 200 }),
  );
  assert.deepEqual(await searchLibraries("x", "", undefined), []);
});

test("searchLibraries surfaces HTTP errors", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("nope", { status: 403 }),
  );
  await assert.rejects(() => searchLibraries("x", "q", "k"), /Context7 库搜索失败 \(403\)/);
});

test("queryDocs returns document text", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string | URL) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("libraryId"), "/org/react");
    assert.equal(url.searchParams.get("query"), "useState");
    return new Response("# docs", { status: 200 });
  });
  assert.equal(await queryDocs("/org/react", "useState", undefined), "# docs");
});

test("queryDocs surfaces HTTP errors", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("missing", { status: 404 }),
  );
  await assert.rejects(() => queryDocs("/org/x", "q", "k"), /Context7 文档查询失败 \(404\)/);
});
