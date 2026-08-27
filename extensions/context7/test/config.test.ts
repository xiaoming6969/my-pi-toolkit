import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configPath, loadConfig } from "../config.ts";

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

test("loadConfig prefers CONTEXT7_API_KEY over the config file", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "context7-config-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const previousKey = process.env.CONTEXT7_API_KEY;
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  process.env.CONTEXT7_API_KEY = "  env-key  ";
  process.env.PI_CODING_AGENT_DIR = dir;
  try {
    assert.deepEqual(loadConfig(), { apiKey: "env-key" });
    assert.equal(configPath(), join(dir, "context7.json"));
  } finally {
    restoreEnv("CONTEXT7_API_KEY", previousKey);
    restoreEnv("PI_CODING_AGENT_DIR", previousDir);
  }
});

test("loadConfig returns empty when env and file are missing", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "context7-config-empty-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const previousKey = process.env.CONTEXT7_API_KEY;
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  delete process.env.CONTEXT7_API_KEY;
  process.env.PI_CODING_AGENT_DIR = dir;
  try {
    assert.deepEqual(loadConfig(), {});
  } finally {
    restoreEnv("CONTEXT7_API_KEY", previousKey);
    restoreEnv("PI_CODING_AGENT_DIR", previousDir);
  }
});
