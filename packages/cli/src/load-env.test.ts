import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, afterEach } from "node:test";
import {
  findEnvFile,
  loadEnv,
  parseEnvFile,
  resetLoadEnvForTests,
} from "./load-env.js";

describe("parseEnvFile", () => {
  it("parses keys, quotes, comments, and export", () => {
    const parsed = parseEnvFile(`
# comment
OZWELL_API_KEY=ozw_plain
OPENAI_API_KEY="sk-quoted"
export ANTHROPIC_API_KEY='sk-ant'
EMPTY=
JERRY_RUNTIME=ozwell
`);
    assert.equal(parsed.OZWELL_API_KEY, "ozw_plain");
    assert.equal(parsed.OPENAI_API_KEY, "sk-quoted");
    assert.equal(parsed.ANTHROPIC_API_KEY, "sk-ant");
    assert.equal(parsed.EMPTY, "");
    assert.equal(parsed.JERRY_RUNTIME, "ozwell");
  });
});

describe("findEnvFile / loadEnv", () => {
  const dirs: string[] = [];

  afterEach(() => {
    resetLoadEnvForTests();
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds .env in a parent of cwd", () => {
    const root = mkdtempSync(join(tmpdir(), "jerry-env-"));
    dirs.push(root);
    const nested = join(root, "a", "b");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, ".env"), "JERRY_URL=http://from-parent:8787\n");

    assert.equal(findEnvFile(nested), join(root, ".env"));
  });

  it("fills missing keys without overriding existing env", () => {
    const root = mkdtempSync(join(tmpdir(), "jerry-env-"));
    dirs.push(root);
    writeFileSync(
      join(root, ".env"),
      "OZWELL_API_KEY=from-file\nOPENAI_API_KEY=also-file\n"
    );

    const env: NodeJS.ProcessEnv = { OZWELL_API_KEY: "from-shell" };
    const path = loadEnv({ cwd: root, env, force: true });

    assert.equal(path, join(root, ".env"));
    assert.equal(env.OZWELL_API_KEY, "from-shell");
    assert.equal(env.OPENAI_API_KEY, "also-file");
  });
});
