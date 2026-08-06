import { describe, it } from "node:test";
import assert from "node:assert";
import {
  ANTHROPIC_ENDPOINT,
  currentRuntimeId,
  defaultModelForRuntime,
  describeRuntimeReadiness,
  findModel,
  findRuntime,
  isModelReady,
  MODELS,
  modelsForRuntime,
  parseModelRef,
  refHintForRuntime,
  resolveModelApiKey,
  RUNTIMES,
  toProfileModel,
} from "./catalog.ts";

const noKeys = {} as NodeJS.ProcessEnv;
const anthropicOnly = { ANTHROPIC_API_KEY: "sk-ant" } as NodeJS.ProcessEnv;

describe("findRuntime", () => {
  it("matches the three runtime ids", () => {
    for (const { id } of RUNTIMES) {
      assert.strictEqual(findRuntime(id)?.id, id, id);
    }
  });

  it("matches aliases and ignores casing and punctuation", () => {
    assert.strictEqual(findRuntime("BYO-CLOUD")?.id, "byo-cloud");
    assert.strictEqual(findRuntime("byocloud")?.id, "byo-cloud");
    assert.strictEqual(findRuntime("cloud")?.id, "byo-cloud");
    assert.strictEqual(findRuntime("ollama")?.id, "local");
  });

  it("returns null for anything else", () => {
    for (const target of ["", "  ", "anthropic", "sonnet", "nope"]) {
      assert.strictEqual(findRuntime(target), null, target);
    }
  });
});

describe("findModel", () => {
  it("matches a model id verbatim", () => {
    assert.strictEqual(findModel("claude-sonnet-5")?.runtime, "byo-cloud");
    assert.strictEqual(findModel("llama3.1:8b")?.runtime, "local");
  });

  it("matches shorthands and ignores casing and punctuation", () => {
    assert.strictEqual(findModel("sonnet")?.id, "claude-sonnet-5");
    assert.strictEqual(findModel("Sonnet 5")?.id, "claude-sonnet-5");
    assert.strictEqual(findModel("claude_sonnet_5")?.id, "claude-sonnet-5");
    assert.strictEqual(findModel("opus")?.id, "claude-opus-5");
    assert.strictEqual(findModel("opus 4.8")?.id, "claude-opus-4-8");
    assert.strictEqual(findModel("sol")?.id, "gpt-5.6-sol");
    assert.strictEqual(findModel("qwen")?.id, "qwen2.5:3b");
  });

  it("keeps similar names distinct", () => {
    assert.strictEqual(findModel("gpt-5.6-sol")?.id, "gpt-5.6-sol");
    assert.strictEqual(findModel("gpt-5.6-terra")?.id, "gpt-5.6-terra");
    assert.strictEqual(findModel("gpt-5.6-luna")?.id, "gpt-5.6-luna");
    assert.strictEqual(findModel("opus 4.5")?.id, "claude-opus-4-5");
    assert.strictEqual(findModel("opus 4.8")?.id, "claude-opus-4-8");
  });

  it("restricts the search to one runtime when asked", () => {
    assert.strictEqual(findModel("sonnet", "byo-cloud")?.id, "claude-sonnet-5");
    assert.strictEqual(findModel("sonnet", "local"), null);
    assert.strictEqual(findModel("fable", "ozwell")?.id, "claude-fable-5");
    assert.strictEqual(findModel("fabel", "ozwell")?.id, "claude-fable-5");
    assert.strictEqual(findModel("llama", "local")?.id, "llama3.1:8b");
  });

  it("returns null for unknown names", () => {
    for (const target of ["", "gemini", "hal 9000"]) {
      assert.strictEqual(findModel(target), null, target);
    }
  });
});

describe("modelsForRuntime", () => {
  it("gives every runtime at least one model", () => {
    for (const { id } of RUNTIMES) {
      assert.ok(modelsForRuntime(id).length > 0, id);
    }
  });

  it("partitions the catalog", () => {
    const total = RUNTIMES.reduce(
      (sum, { id }) => sum + modelsForRuntime(id).length,
      0
    );
    assert.strictEqual(total, MODELS.length);
  });
});

describe("currentRuntimeId", () => {
  it("passes through a known runtime", () => {
    assert.strictEqual(currentRuntimeId("byo-cloud"), "byo-cloud");
  });

  it("falls back to local for anything unrecognized", () => {
    assert.strictEqual(currentRuntimeId(undefined), "local");
    assert.strictEqual(currentRuntimeId("nonsense"), "local");
  });
});

describe("resolveModelApiKey", () => {
  it("needs no key for local models", () => {
    const llama = findModel("llama")!;
    assert.strictEqual(resolveModelApiKey(llama, noKeys), undefined);
    assert.strictEqual(isModelReady(llama, noKeys), true);
  });

  it("reads the provider variable each model names", () => {
    assert.strictEqual(
      resolveModelApiKey(findModel("sonnet")!, anthropicOnly),
      "sk-ant"
    );
    assert.strictEqual(
      resolveModelApiKey(findModel("gpt-5.6-sol")!, anthropicOnly),
      undefined
    );
  });

  it("accepts JERRY_API_KEY as the generic cloud override", () => {
    const env = { JERRY_API_KEY: "sk-generic" } as NodeJS.ProcessEnv;
    assert.strictEqual(
      resolveModelApiKey(findModel("gpt-5.6-sol")!, env),
      "sk-generic"
    );
  });

  it("accepts either Ozwell key", () => {
    const ozwell = modelsForRuntime("ozwell")[0];
    assert.strictEqual(
      resolveModelApiKey(ozwell, { OZWELL_AGENT_KEY: "agnt" } as NodeJS.ProcessEnv),
      "agnt"
    );
  });
});

describe("describeRuntimeReadiness", () => {
  it("reports local as always ready", () => {
    assert.deepStrictEqual(describeRuntimeReadiness("local", noKeys), {
      ready: true,
      missing: [],
    });
  });

  it("lists every key that would unlock a cloud runtime", () => {
    const { ready, missing } = describeRuntimeReadiness("byo-cloud", noKeys);
    assert.strictEqual(ready, false);
    assert.deepStrictEqual(missing, ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]);
  });

  it("counts a runtime ready as soon as one model has a key", () => {
    assert.strictEqual(
      describeRuntimeReadiness("byo-cloud", anthropicOnly).ready,
      true
    );
  });
});

describe("defaultModelForRuntime", () => {
  it("picks the first model whose key is present", () => {
    assert.strictEqual(
      defaultModelForRuntime("byo-cloud", { OPENAI_API_KEY: "sk" } as NodeJS.ProcessEnv)?.id,
      "gpt-5.6-sol"
    );
    assert.strictEqual(
      defaultModelForRuntime("byo-cloud", anthropicOnly)?.id,
      "claude-sonnet-5"
    );
  });

  it("falls back to the first model when no key is present", () => {
    const model = defaultModelForRuntime("byo-cloud", noKeys);
    assert.strictEqual(model?.id, "claude-sonnet-5");
    assert.strictEqual(isModelReady(model!, noKeys), false);
  });

  it("defaults ozwell to Opus 5", () => {
    assert.strictEqual(
      defaultModelForRuntime("ozwell", { OZWELL_API_KEY: "ozw" } as NodeJS.ProcessEnv)?.id,
      "claude-opus-5"
    );
  });
});

describe("parseModelRef", () => {
  it("accepts a raw ollama ref", () => {
    const model = parseModelRef("ollama:mistral");
    assert.strictEqual(model?.runtime, "local");
    assert.strictEqual(model?.id, "mistral");
    assert.strictEqual(model?.requiredEnvKey, undefined);
  });

  it("accepts a raw endpoint#model ref and infers the key", () => {
    const groq = parseModelRef("https://api.groq.com/openai/v1#llama-3.1-70b");
    assert.strictEqual(groq?.runtime, "byo-cloud");
    assert.strictEqual(groq?.endpoint, "https://api.groq.com/openai/v1");
    assert.strictEqual(groq?.requiredEnvKey, "OPENAI_API_KEY");

    const claude = parseModelRef(`${ANTHROPIC_ENDPOINT}#claude-opus-5`);
    assert.strictEqual(claude?.requiredEnvKey, "ANTHROPIC_API_KEY");
  });

  it("returns null for a bare name", () => {
    for (const target of ["sonnet", "ollama:", "https://api.openai.com/v1", ""]) {
      assert.strictEqual(parseModelRef(target), null, target);
    }
  });
});

describe("toProfileModel", () => {
  it("builds the reference format the worker expects", () => {
    assert.strictEqual(toProfileModel(findModel("llama")!), "ollama:llama3.1:8b");
    assert.strictEqual(
      toProfileModel(findModel("sonnet")!),
      "https://api.anthropic.com/v1#claude-sonnet-5"
    );
    assert.strictEqual(
      toProfileModel(findModel("opus", "ozwell")!),
      "claude-opus-5"
    );
  });

  it("does not double-prefix an ollama ref", () => {
    assert.strictEqual(
      toProfileModel(parseModelRef("ollama:mistral")!),
      "ollama:mistral"
    );
  });

  it("produces a parseable ref for every catalog entry", () => {
    for (const model of MODELS) {
      const ref = toProfileModel(model);
      if (model.runtime === "byo-cloud") {
        assert.match(ref, /^https:\/\/\S+#\S+$/, model.id);
      } else if (model.runtime === "local") {
        assert.match(ref, /^ollama:\S+$/, model.id);
      }
    }
  });

  it("gives every cloud model a key requirement, and byo-cloud an endpoint", () => {
    for (const model of MODELS) {
      if (model.runtime !== "local") {
        assert.ok(model.requiredEnvKey, model.id);
      }
      if (model.runtime === "byo-cloud") {
        assert.ok(model.endpoint, model.id);
      }
    }
  });
});

describe("refHintForRuntime", () => {
  it("names the escape hatch for runtimes that have one", () => {
    assert.match(String(refHintForRuntime("local")), /ollama:<name>/);
    assert.match(String(refHintForRuntime("byo-cloud")), /#<model>/);
    assert.strictEqual(refHintForRuntime("ozwell"), null);
  });
});
