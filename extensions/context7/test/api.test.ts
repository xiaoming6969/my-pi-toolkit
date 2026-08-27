import assert from "node:assert/strict";
import test from "node:test";
import { formatSearchResults } from "../api.ts";

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
