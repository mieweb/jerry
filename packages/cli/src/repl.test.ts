import { describe, it } from "node:test";
import assert from "node:assert";
import {
  generateSessionId,
  isExitCommand,
  renderBanner,
  renderFarewell,
  renderToolsFooter,
  runSlashCommand,
  type ReplContext,
} from "./repl.ts";
import { resolveEntry } from "./run.ts";

const context: ReplContext = {
  sessionId: "session-1754239-a9f2",
  url: "http://127.0.0.1:8787",
  profile: { runtime: "local", model: "ollama:llama3.1:8b", egress: "deny" },
};

const plain = { color: false };

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

  it("/runtime and /model report resolved values", () => {
    assert.match(runSlashCommand("/runtime", context, plain).lines.join("\n"), /local/);
    assert.match(runSlashCommand("/model", context, plain).lines.join("\n"), /llama3\.1:8b/);
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
