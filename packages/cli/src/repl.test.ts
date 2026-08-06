import { describe, it } from "node:test";
import assert from "node:assert";
import {
  generateSessionId,
  isExitCommand,
  renderBanner,
  renderFarewell,
  renderToolsFooter,
  runSlashCommand,
  setModel,
  setRuntime,
  type ReplContext,
} from "./repl.ts";
import { describeProfile, type JerryConfig } from "./profile.ts";
import { resolveEntry } from "./run.ts";

const context: ReplContext = {
  sessionId: "session-1754239-a9f2",
  url: "http://127.0.0.1:8787",
  profile: { runtime: "local", model: "ollama:llama3.1:8b", egress: "deny" },
};

const plain = { color: false };

/** Keeps the developer's own shell out of readiness assertions. */
const noKeys = {} as NodeJS.ProcessEnv;

describe("isExitCommand", () => {
  it("accepts the documented exit keywords", () => {
    for (const line of ["q", "quit", "exit", "  Q  ", "EXIT"]) {
      assert.strictEqual(isExitCommand(line), true, line);
    }
  });

  it("does not match ordinary messages", () => {
    for (const line of ["quitting my job", "question", "", "exits"]) {
      assert.strictEqual(isExitCommand(line), false, line);
    }
  });
});

describe("generateSessionId", () => {
  it("uses the server session ID shape", () => {
    assert.match(generateSessionId(), /^session-\d+-[a-z0-9]+$/);
  });
});

describe("renderBanner", () => {
  it("shows runtime, model, egress, session and resume hint", () => {
    const text = renderBanner(context, plain).join("\n");

    assert.match(text, /runtime {2}local/);
    assert.match(text, /model {2}ollama:llama3\.1:8b/);
    assert.match(text, /egress {2}deny/);
    assert.match(text, /session {2}session-1754239-a9f2/);
    assert.match(text, /resume: jerry --session session-1754239-a9f2/);
    assert.match(text, /q \u00b7 exit \u00b7 Ctrl\+C/);
  });

  it("emits no ANSI codes when color is off", () => {
    assert.ok(!renderBanner(context, plain).join("\n").includes("\u001b["));
  });

  it("greets differently when resuming", () => {
    const fresh = renderBanner(context, plain).join("\n");
    const resumed = renderBanner(context, { ...plain, resumed: true }).join("\n");

    assert.match(fresh, /Ask me about your work/);
    assert.match(resumed, /Resuming where we left off/);
  });
});

describe("renderToolsFooter", () => {
  it("omits the footer entirely when no tools ran", () => {
    assert.deepStrictEqual(renderToolsFooter([], plain), []);
  });

  it("lists a single tool", () => {
    const lines = renderToolsFooter(["summarize_activity"], plain);
    assert.strictEqual(lines[0], "  tools: summarize_activity");
  });

  it("joins multiple tools in call order", () => {
    const lines = renderToolsFooter(
      ["summarize_activity", "search_memory", "read_file"],
      plain
    );
    assert.strictEqual(
      lines[0],
      "  tools: summarize_activity \u00b7 search_memory \u00b7 read_file"
    );
  });

  it("glosses tools with de-duplicated source labels", () => {
    const lines = renderToolsFooter(["read_file", "list_watched"], plain);
    assert.strictEqual(lines[1], "  sources: local files");
  });

  it("skips the gloss for unknown tool names", () => {
    const lines = renderToolsFooter(["mystery_tool"], plain);
    assert.strictEqual(lines.length, 1);
  });
});

describe("renderFarewell", () => {
  it("always prints the resume command", () => {
    const text = renderFarewell("session-abc", plain).join("\n");
    assert.match(text, /Session saved/);
    assert.match(text, /jerry --session session-abc/);
  });
});

describe("runSlashCommand", () => {
  it("/help lists the commands", () => {
    const result = runSlashCommand("/help", context, plain);
    const text = result.lines.join("\n");

    assert.strictEqual(result.kind, "output");
    for (const command of ["/session", "/new", "/runtime", "/model", "/sources", "/dryrun"]) {
      assert.ok(text.includes(command), command);
    }
  });

  it("/session prints the ID and resume command", () => {
    const text = runSlashCommand("/session", context, plain).lines.join("\n");
    assert.match(text, /session-1754239-a9f2/);
    assert.match(text, /jerry --session session-1754239-a9f2/);
  });

  it("/new hands back a different session ID", () => {
    const result = runSlashCommand("/new", context, plain);
    assert.strictEqual(result.kind, "new-session");
    if (result.kind !== "new-session") return;
    assert.notStrictEqual(result.sessionId, context.sessionId);
    assert.match(result.sessionId, /^session-\d+-[a-z0-9]+$/);
  });

  it("/runtime reports the current value and lists the alternatives", () => {
    const text = runSlashCommand("/runtime", context, {
      ...plain,
      env: noKeys,
    }).lines.join("\n");

    assert.match(text, /runtime {2}local/);
    for (const id of ["local", "byo-cloud", "ozwell"]) {
      assert.ok(text.includes(id), id);
    }
    assert.match(text, /switch with \/runtime <name>/);
  });

  it("/runtime marks a runtime whose keys are missing", () => {
    const text = runSlashCommand("/runtime", context, {
      ...plain,
      env: noKeys,
    }).lines.join("\n");

    assert.match(text, /needs ANTHROPIC_API_KEY or OPENAI_API_KEY/);
    assert.match(text, /needs OZWELL_API_KEY/);
  });

  it("/model lists only the current runtime's models", () => {
    const text = runSlashCommand("/model", context, {
      ...plain,
      env: noKeys,
    }).lines.join("\n");

    assert.match(text, /model {2}ollama:llama3\.1:8b/);
    assert.match(text, /available in local/);
    assert.ok(text.includes("qwen2.5:3b"));
    assert.ok(!text.includes("gpt-5.6-sol"), "no models from other runtimes");
    assert.match(text, /ollama:<name>/);
  });

  it("/sources reports source status", () => {
    const text = runSlashCommand("/sources", context, plain).lines.join("\n");
    assert.match(text, /ActivityWatch/);
    assert.match(text, /TimeHuddle {6}planned/);
  });

  it("/dryrun without a task explains usage", () => {
    const text = runSlashCommand("/dryrun", context, plain).lines.join("\n");
    assert.match(text, /usage: \/dryrun <task>/);
  });

  it("/dryrun echoes the task without sending", () => {
    const text = runSlashCommand("/dryrun summarize my day", context, plain).lines.join("\n");
    assert.match(text, /nothing sent/);
    assert.match(text, /summarize my day/);
    assert.match(text, /candidate tools:/);
  });

  it("unknown commands point at /help", () => {
    const text = runSlashCommand("/nope", context, plain).lines.join("\n");
    assert.match(text, /unknown command \/nope/);
  });

  it("/runtime and /model with an argument hand the change to the caller", () => {
    const cases: Array<[string, "runtime" | "model", string]> = [
      ["/model sonnet 5", "model", "sonnet 5"],
      ["/runtime ozwell", "runtime", "ozwell"],
    ];

    for (const [input, scope, target] of cases) {
      const result = runSlashCommand(input, context, plain);
      assert.strictEqual(result.kind, "set", input);
      if (result.kind !== "set") continue;
      assert.strictEqual(result.scope, scope);
      assert.strictEqual(result.target, target);
    }
  });
});

/** Fresh fixtures: a change mutates both the config and the context. */
function fixture() {
  const config: JerryConfig = {
    url: "http://127.0.0.1:8787",
    profile: { runtime: "local", model: "ollama:llama3.1:8b", egress: "deny" },
  };
  return {
    config,
    context: {
      sessionId: "session-1",
      url: config.url,
      profile: describeProfile(config.profile),
    } satisfies ReplContext,
  };
}

const anthropicOnly = { ANTHROPIC_API_KEY: "sk-ant-test" } as NodeJS.ProcessEnv;

describe("setRuntime", () => {
  it("moves to a cloud runtime and lands on a model it can call", () => {
    const { config, context: ctx } = fixture();
    const result = setRuntime("byo-cloud", config, ctx, {
      ...plain,
      env: anthropicOnly,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(config.profile?.runtime, "byo-cloud");
    assert.strictEqual(
      config.profile?.model,
      "https://api.anthropic.com/v1#claude-sonnet-5"
    );
    assert.strictEqual(config.profile?.apiKey, "sk-ant-test");
    assert.match(result.lines.join("\n"), /Now using Claude Sonnet 5/);
  });

  it("picks the model whose key is actually present", () => {
    const { config, context: ctx } = fixture();
    setRuntime("byo-cloud", config, ctx, {
      ...plain,
      env: { OPENAI_API_KEY: "sk-openai" } as NodeJS.ProcessEnv,
    });

    assert.match(String(config.profile?.model), /#gpt-5\.6-sol$/);
  });

  it("accepts runtime aliases", () => {
    const { config, context: ctx } = fixture();
    const result = setRuntime("cloud", config, ctx, {
      ...plain,
      env: anthropicOnly,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(ctx.profile.runtime, "byo-cloud");
  });

  it("reports allow-model egress for cloud runtimes", () => {
    const { config, context: ctx } = fixture();
    setRuntime("byo-cloud", config, ctx, { ...plain, env: anthropicOnly });
    assert.strictEqual(ctx.profile.egress, "allow-model");
  });

  it("leaves a broader egress policy alone", () => {
    const { config, context: ctx } = fixture();
    config.profile = { ...config.profile, egress: "allow-tools" };
    setRuntime("byo-cloud", config, ctx, { ...plain, env: anthropicOnly });
    assert.strictEqual(ctx.profile.egress, "allow-tools");
  });

  it("restores strict egress and drops the key when returning to local", () => {
    const { config, context: ctx } = fixture();
    setRuntime("byo-cloud", config, ctx, { ...plain, env: anthropicOnly });
    setRuntime("local", config, ctx, { ...plain, env: anthropicOnly });

    assert.strictEqual(ctx.profile.runtime, "local");
    assert.strictEqual(ctx.profile.model, "ollama:llama3.1:8b");
    assert.strictEqual(ctx.profile.egress, "deny");
    assert.strictEqual(config.profile?.apiKey, undefined);
  });

  it("names every key that would unlock the runtime, and stays put", () => {
    const { config, context: ctx } = fixture();
    const result = setRuntime("byo-cloud", config, ctx, {
      ...plain,
      env: noKeys,
    });
    const text = result.lines.join("\n");

    assert.strictEqual(result.success, false);
    assert.match(text, /ANTHROPIC_API_KEY or OPENAI_API_KEY are not set/);
    assert.match(text, /Check the API keys and try again/);
    assert.strictEqual(config.profile?.runtime, "local");
  });

  it("uses the singular when only one key is missing", () => {
    const { config, context: ctx } = fixture();
    const result = setRuntime("ozwell", config, ctx, { ...plain, env: noKeys });

    assert.strictEqual(result.success, false);
    assert.match(result.lines.join("\n"), /OZWELL_API_KEY is not set/);
  });

  it("lists the runtimes for an unknown name", () => {
    const { config, context: ctx } = fixture();
    const result = setRuntime("anthropic", config, ctx, plain);
    const text = result.lines.join("\n");

    assert.strictEqual(result.success, false);
    assert.match(text, /don't know the runtime "anthropic"/);
    assert.match(text, /local/);
    assert.match(text, /byo-cloud/);
    assert.strictEqual(config.profile?.runtime, "local");
  });
});

describe("setModel", () => {
  it("moves between models in the current runtime", () => {
    const { config, context: ctx } = fixture();
    const result = setModel("qwen", config, ctx, { ...plain, env: noKeys });

    assert.strictEqual(result.success, true);
    assert.strictEqual(config.profile?.model, "ollama:qwen2.5:3b");
    assert.strictEqual(config.profile?.apiKey, undefined);
    assert.strictEqual(ctx.profile.egress, "deny");
  });

  it("accepts the full model id as listed", () => {
    const { config, context: ctx } = fixture();
    const result = setModel("qwen2.5:3b", config, ctx, { ...plain, env: noKeys });
    assert.strictEqual(result.success, true);
  });

  it("points at the right runtime for a model that lives elsewhere", () => {
    const { config, context: ctx } = fixture();
    const result = setModel("gpt-5.6-sol", config, ctx, {
      ...plain,
      env: anthropicOnly,
    });
    const text = result.lines.join("\n");

    assert.strictEqual(result.success, false);
    assert.match(text, /gpt-5\.6-sol isn't available in the local runtime/);
    assert.match(text, /\/runtime byo-cloud/);
    assert.strictEqual(config.profile?.runtime, "local");
  });

  it("lists this runtime's models for an unknown name", () => {
    const { config, context: ctx } = fixture();
    const result = setModel("hal 9000", config, ctx, plain);
    const text = result.lines.join("\n");

    assert.strictEqual(result.success, false);
    assert.match(text, /don't know the model "hal 9000" in the local runtime/);
    assert.match(text, /llama3\.1:8b/);
    assert.ok(!text.includes("gpt-5.6-sol"), "only the current runtime's models");
  });

  it("names the missing variable and keeps the current model", () => {
    const { config, context: ctx } = fixture();
    setRuntime("byo-cloud", config, ctx, { ...plain, env: anthropicOnly });
    const result = setModel("gpt-5.6-sol", config, ctx, {
      ...plain,
      env: anthropicOnly,
    });
    const text = result.lines.join("\n");

    assert.strictEqual(result.success, false);
    assert.match(text, /OPENAI_API_KEY isn't set, so I can't use GPT-5\.6 Sol/);
    assert.match(text, /export OPENAI_API_KEY=/);
    assert.match(text, /Staying on claude-sonnet-5\./);
    assert.match(String(config.profile?.model), /claude-sonnet-5$/);
  });

  it("accepts a raw ollama ref for a model outside the catalog", () => {
    const { config, context: ctx } = fixture();
    const result = setModel("ollama:mistral", config, ctx, {
      ...plain,
      env: noKeys,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(config.profile?.model, "ollama:mistral");
  });

  it("rejects a raw ref that belongs to another runtime", () => {
    const { config, context: ctx } = fixture();
    const result = setModel(
      "https://api.groq.com/openai/v1#llama-3.1-70b",
      config,
      ctx,
      { ...plain, env: noKeys }
    );

    assert.strictEqual(result.success, false);
    assert.match(result.lines.join("\n"), /for the byo-cloud runtime, not local/);
  });

  it("emits no ANSI codes when color is off", () => {
    for (const target of ["qwen", "gpt-5.6-sol", "hal 9000", "ollama:mistral"]) {
      const { config, context: ctx } = fixture();
      const result = setModel(target, config, ctx, { ...plain, env: noKeys });
      assert.ok(!result.lines.join("\n").includes("\u001b["), target);
    }
  });
});

describe("resolveEntry", () => {
  const env = {} as NodeJS.ProcessEnv;

  it("routes the MCP subcommand", () => {
    assert.deepStrictEqual(resolveEntry(["mcp"], env), { kind: "mcp" });
  });

  it("opens the REPL with no arguments", () => {
    assert.deepStrictEqual(resolveEntry([], env), { kind: "repl", sessionId: undefined });
  });

  it("opens the REPL on a bare greeting", () => {
    assert.strictEqual(resolveEntry(["hello"], env).kind, "repl");
    assert.strictEqual(resolveEntry(["hi", "jerry"], env).kind, "repl");
  });

  it("resumes a session in the REPL when no message follows", () => {
    assert.deepStrictEqual(resolveEntry(["--session", "session-abc"], env), {
      kind: "repl",
      sessionId: "session-abc",
    });
    assert.deepStrictEqual(resolveEntry(["-s", "session-abc"], env), {
      kind: "repl",
      sessionId: "session-abc",
    });
  });

  it("honors JERRY_SESSION for a bare invocation", () => {
    assert.deepStrictEqual(
      resolveEntry([], { JERRY_SESSION: "session-env" } as NodeJS.ProcessEnv),
      { kind: "repl", sessionId: "session-env" }
    );
  });

  it("keeps one-shot behavior for messages and meta flags", () => {
    for (const args of [
      ["summarize", "my", "last", "2", "hours"],
      ["hi", "jerry", "summarize", "my", "day"],
      ["--help"],
      ["--version"],
      ["-txt", "a", "note"],
      ["--session", "session-abc", "summarize", "my", "day"],
    ]) {
      assert.strictEqual(resolveEntry(args, env).kind, "one-shot", args.join(" "));
    }
  });
});
