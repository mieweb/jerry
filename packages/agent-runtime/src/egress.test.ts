import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { tool } from "ai";
import { filterTools } from "./backends/local.ts";
import type { PrivacyProfile } from "./types.ts";

const makeTool = (name: string) =>
  tool({
    description: `Test tool: ${name}`,
    parameters: z.object({}),
    execute: async () => `result from ${name}`,
  });

const baseProfile: PrivacyProfile = {
  runtime: "local",
  model: "ollama:qwen2.5",
  egress: "deny",
  tools: {},
};

describe("filterTools", () => {
  describe("with egress: deny", () => {
    it("returns undefined when no tools provided", () => {
      const result = filterTools(undefined, baseProfile);
      assert.equal(result, undefined);
    });

    it("returns undefined when tools is empty object", () => {
      const result = filterTools({}, baseProfile);
      assert.equal(result, undefined);
    });

    it("keeps tools marked as local", () => {
      const tools = {
        aw: makeTool("aw"),
        footnote: makeTool("footnote"),
      };
      const profile: PrivacyProfile = {
        ...baseProfile,
        egress: "deny",
        tools: { aw: "local", footnote: "local" },
      };

      const result = filterTools(tools, profile);
      assert.ok(result);
      assert.ok("aw" in result);
      assert.ok("footnote" in result);
    });

    it("removes tools marked as ask", () => {
      const tools = {
        aw: makeTool("aw"),
        read_drive: makeTool("read_drive"),
      };
      const profile: PrivacyProfile = {
        ...baseProfile,
        egress: "deny",
        tools: { aw: "local", read_drive: "ask" },
      };

      const result = filterTools(tools, profile);
      assert.ok(result);
      assert.ok("aw" in result);
      assert.ok(!("read_drive" in result));
    });

    it("removes tools marked as allow", () => {
      const tools = {
        aw: makeTool("aw"),
        post_youtube: makeTool("post_youtube"),
      };
      const profile: PrivacyProfile = {
        ...baseProfile,
        egress: "deny",
        tools: { aw: "local", post_youtube: "allow" },
      };

      const result = filterTools(tools, profile);
      assert.ok(result);
      assert.ok("aw" in result);
      assert.ok(!("post_youtube" in result));
    });

    it("removes tools not in disposition list", () => {
      const tools = {
        aw: makeTool("aw"),
        unknown: makeTool("unknown"),
      };
      const profile: PrivacyProfile = {
        ...baseProfile,
        egress: "deny",
        tools: { aw: "local" },
      };

      const result = filterTools(tools, profile);
      assert.ok(result);
      assert.ok("aw" in result);
      assert.ok(!("unknown" in result));
    });

    it("returns undefined when all tools are filtered out", () => {
      const tools = {
        read_drive: makeTool("read_drive"),
        post_youtube: makeTool("post_youtube"),
      };
      const profile: PrivacyProfile = {
        ...baseProfile,
        egress: "deny",
        tools: { read_drive: "ask", post_youtube: "allow" },
      };

      const result = filterTools(tools, profile);
      assert.equal(result, undefined);
    });
  });

  describe("with egress: allow-model", () => {
    it("behaves same as deny (only local tools allowed)", () => {
      const tools = {
        aw: makeTool("aw"),
        read_drive: makeTool("read_drive"),
      };
      const profile: PrivacyProfile = {
        ...baseProfile,
        egress: "allow-model",
        tools: { aw: "local", read_drive: "ask" },
      };

      const result = filterTools(tools, profile);
      assert.ok(result);
      assert.ok("aw" in result);
      assert.ok(!("read_drive" in result));
    });
  });

  describe("with egress: allow-tools", () => {
    it("passes through all tools", () => {
      const tools = {
        aw: makeTool("aw"),
        read_drive: makeTool("read_drive"),
        post_youtube: makeTool("post_youtube"),
      };
      const profile: PrivacyProfile = {
        ...baseProfile,
        egress: "allow-tools",
        tools: { aw: "local", read_drive: "ask", post_youtube: "allow" },
      };

      const result = filterTools(tools, profile);
      assert.ok(result);
      assert.ok("aw" in result);
      assert.ok("read_drive" in result);
      assert.ok("post_youtube" in result);
    });

    it("passes through tools not in disposition list", () => {
      const tools = {
        unknown: makeTool("unknown"),
      };
      const profile: PrivacyProfile = {
        ...baseProfile,
        egress: "allow-tools",
        tools: {},
      };

      const result = filterTools(tools, profile);
      assert.ok(result);
      assert.ok("unknown" in result);
    });
  });

  describe("with no tools in profile", () => {
    it("filters out all tools when egress: deny", () => {
      const tools = {
        aw: makeTool("aw"),
      };
      const profile: PrivacyProfile = {
        ...baseProfile,
        egress: "deny",
        tools: undefined,
      };

      const result = filterTools(tools, profile);
      assert.equal(result, undefined);
    });
  });
});
