import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildModelNodes,
  buildRuntimeNodes,
  OZWELL_OTHER_TOGGLE_ID,
} from "./RuntimePicker.tsx";
import type { TermConfig } from "../../config/index.ts";

const baseConfig: TermConfig = {
  runtime: "local",
  model: "ollama:llama3.1:8b",
};

describe("RuntimePicker helpers", () => {
  it("buildModelNodes lists live Ollama models for local runtime", () => {
    const nodes = buildModelNodes(baseConfig, "local", undefined, [
      "llama3.1:8b",
      "qwen2.5:3b",
    ]);

    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].model, "llama3.1:8b");
    assert.equal(nodes[0].description, "(current)");
    assert.equal(nodes[1].model, "qwen2.5:3b");
  });

  it("buildModelNodes shows loading state for local", () => {
    const nodes = buildModelNodes(baseConfig, "local", undefined, undefined, {
      loading: true,
    });
    assert.equal(nodes[0].id, "ollama-loading");
  });

  it("buildModelNodes shows error when Ollama unavailable", () => {
    const nodes = buildModelNodes(baseConfig, "local", undefined, [], {
      ollamaError: "ECONNREFUSED",
    });
    assert.equal(nodes[0].id, "ollama-error");
    assert.match(nodes[0].description ?? "", /ECONNREFUSED/);
  });

  it("buildModelNodes shows empty state when no models installed", () => {
    const nodes = buildModelNodes(baseConfig, "local", undefined, []);
    assert.equal(nodes[0].id, "ollama-empty");
  });

  it("buildModelNodes shows recommended Ozwell models first and collapses other", () => {
    const nodes = buildModelNodes(
      { runtime: "ozwell", model: "gpt-4o" },
      "ozwell",
      undefined,
      undefined,
      {
        ozwellModels: ["gpt-4o", "custom-ozwell-model", "gpt-4.1-mini", "whisper-1"],
        ozwellUsedFallback: false,
      }
    );

    const modelIds = nodes.filter((n) => n.model).map((n) => n.model);
    assert.deepEqual(modelIds, ["gpt-4o", "gpt-4.1-mini"]);
    const toggle = nodes.find((n) => n.id === OZWELL_OTHER_TOGGLE_ID);
    assert.ok(toggle?.isToggle);
    assert.match(toggle.label, /▶ Other models \(2\)/);
    assert.equal(
      nodes.some((n) => n.model === "custom-ozwell-model"),
      false
    );
  });

  it("buildModelNodes expands other Ozwell models when requested", () => {
    const nodes = buildModelNodes(
      { runtime: "ozwell", model: "gpt-4o" },
      "ozwell",
      undefined,
      undefined,
      {
        ozwellModels: ["gpt-4o", "custom-ozwell-model", "whisper-1"],
        ozwellUsedFallback: false,
        ozwellOtherExpanded: true,
      }
    );

    const toggle = nodes.find((n) => n.id === OZWELL_OTHER_TOGGLE_ID);
    assert.ok(toggle);
    assert.match(toggle.label, /▼ Other models \(2\)/);
    assert.ok(nodes.some((n) => n.model === "custom-ozwell-model"));
    assert.ok(nodes.some((n) => n.model === "whisper-1"));
  });

  it("buildModelNodes pins non-curated current Ozwell model into recommended", () => {
    const nodes = buildModelNodes(
      { runtime: "ozwell", model: "custom-ozwell-model" },
      "ozwell",
      undefined,
      undefined,
      {
        ozwellModels: ["gpt-4.1-mini", "custom-ozwell-model"],
        ozwellUsedFallback: false,
      }
    );

    assert.equal(nodes[0].model, "custom-ozwell-model");
    assert.match(nodes[0].description ?? "", /current/);
  });

  it("buildModelNodes marks curated Ozwell fallback", () => {
    const nodes = buildModelNodes(
      { runtime: "ozwell", model: "gpt-4.1-mini" },
      "ozwell",
      undefined,
      undefined,
      {
        ozwellModels: ["gpt-4.1-mini"],
        ozwellUsedFallback: true,
        ozwellError: "HTTP 401",
      }
    );
    assert.match(nodes[0].description ?? "", /Recommended default|current/);
  });

  it("buildRuntimeNodes shows Ollama model count", () => {
    const nodes = buildRuntimeNodes(baseConfig, ["a", "b", "c"]);
    const local = nodes.find((n) => n.runtime === "local");
    assert.ok(local);
    assert.match(local.description ?? "", /3 models available/);
  });

  it("buildRuntimeNodes shows Ollama unavailable", () => {
    const nodes = buildRuntimeNodes(
      { ...baseConfig, runtime: "ozwell", model: "gpt-4.1-mini" },
      [],
      "Not running"
    );
    const local = nodes.find((n) => n.runtime === "local");
    assert.ok(local);
    assert.equal(local.description, "Ollama unavailable");
  });
});
