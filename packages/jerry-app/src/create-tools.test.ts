/**
 * Tests for Jerry MCP tool wiring.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  createJerryToolsWithMcp,
  ensureMcpTools,
  resetMcpToolsCache,
  setMcpToolsCacheForTest,
} from "./create-tools.js";
import {
  getDefaultFootnoteConfig,
  resolveFootnoteDbPath,
  resolveMcpServers,
} from "./mcp-config.js";

describe("resolveFootnoteDbPath", () => {
  let originalDb: string | undefined;

  beforeEach(() => {
    originalDb = process.env.FOOTNOTE_DB;
  });

  afterEach(() => {
    if (originalDb === undefined) {
      delete process.env.FOOTNOTE_DB;
    } else {
      process.env.FOOTNOTE_DB = originalDb;
    }
  });

  it("expands ~ in FOOTNOTE_DB", () => {
    process.env.FOOTNOTE_DB = "~/jerry-footnote-test/.footnote";
    const resolved = resolveFootnoteDbPath();
    assert.ok(!resolved.includes("~"));
    assert.ok(resolved.endsWith("jerry-footnote-test/.footnote"));
  });
});

describe("getDefaultFootnoteConfig", () => {
  it("passes --db to docidx mcp", () => {
    const config = getDefaultFootnoteConfig();
    assert.equal(config.name, "footnote");
    assert.ok(config.args?.includes("mcp"));
    assert.ok(config.args?.includes("--db"));
  });
});

describe("resolveMcpServers", () => {
  let originalDisabled: string | undefined;
  let originalEnabled: string | undefined;

  beforeEach(() => {
    originalDisabled = process.env.JERRY_MCP_DISABLED;
    originalEnabled = process.env.JERRY_FOOTNOTE_ENABLED;
    delete process.env.JERRY_MCP_DISABLED;
    delete process.env.JERRY_FOOTNOTE_ENABLED;
  });

  afterEach(() => {
    if (originalDisabled === undefined) {
      delete process.env.JERRY_MCP_DISABLED;
    } else {
      process.env.JERRY_MCP_DISABLED = originalDisabled;
    }
    if (originalEnabled === undefined) {
      delete process.env.JERRY_FOOTNOTE_ENABLED;
    } else {
      process.env.JERRY_FOOTNOTE_ENABLED = originalEnabled;
    }
  });

  it("defaults to footnote when MCP is enabled", () => {
    const servers = resolveMcpServers();
    assert.equal(servers.length, 1);
    assert.equal(servers[0]?.name, "footnote");
  });

  it("returns empty list when JERRY_MCP_DISABLED=true", () => {
    process.env.JERRY_MCP_DISABLED = "true";
    assert.deepEqual(resolveMcpServers(), []);
  });

  it("returns empty list when JERRY_FOOTNOTE_ENABLED=false", () => {
    process.env.JERRY_FOOTNOTE_ENABLED = "false";
    assert.deepEqual(resolveMcpServers(), []);
  });
});

describe("createJerryToolsWithMcp", () => {
  const ctx = {
    sessionId: "test",
    db: {} as never,
    scheduleWake: async () => {},
    suspendForUser: () => {},
    suspendForApproval: () => {},
  };

  beforeEach(() => {
    resetMcpToolsCache();
  });

  afterEach(() => {
    resetMcpToolsCache();
  });

  it("returns core tools when MCP is not loaded", () => {
    const tools = createJerryToolsWithMcp(ctx);
    assert.ok(tools.search_memory);
    assert.equal(tools.search_hybrid, undefined);
  });

  it("merges footnote tools and drops search_memory when hybrid is present", () => {
    setMcpToolsCacheForTest({
      search_hybrid: { description: "hybrid" } as never,
    });

    const tools = createJerryToolsWithMcp(ctx);
    assert.ok(tools.search_hybrid);
    assert.equal(tools.search_memory, undefined);
    assert.ok(tools.summarize_activity);
  });
});

describe("ensureMcpTools fallback", () => {
  let originalDisabled: string | undefined;

  beforeEach(() => {
    originalDisabled = process.env.JERRY_MCP_DISABLED;
    resetMcpToolsCache();
  });

  afterEach(() => {
    if (originalDisabled === undefined) {
      delete process.env.JERRY_MCP_DISABLED;
    } else {
      process.env.JERRY_MCP_DISABLED = originalDisabled;
    }
    resetMcpToolsCache();
  });

  it("returns undefined when MCP servers are disabled (in-process fallback)", async () => {
    process.env.JERRY_MCP_DISABLED = "true";
    const tools = await ensureMcpTools();
    assert.equal(tools, undefined);

    const turnTools = createJerryToolsWithMcp({
      sessionId: "test",
      db: {} as never,
      scheduleWake: async () => {},
      suspendForUser: () => {},
      suspendForApproval: () => {},
    });
    assert.ok(turnTools.search_memory);
    assert.equal(turnTools.search_hybrid, undefined);
  });
});
