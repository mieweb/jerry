import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { CommandRegistry } from "./registry.ts";
import { runtimeCommand } from "./runtime.ts";
import { configCommand } from "./config.ts";
import { exitCommand } from "./exit.ts";
import { createHelpCommand } from "./help.ts";
import { createDefaultRegistry } from "./index.ts";
import type { CommandContext } from "./types.ts";
import type { OutputWriter } from "../repl/output.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockCall = { arguments: any[] };

function createMockContext(overrides?: Partial<CommandContext>): CommandContext {
  const mockOutput = {
    write: mock.fn(),
    writeLine: mock.fn(),
    streamText: mock.fn(),
    newLine: mock.fn(),
    clear: mock.fn(),
  };

  return {
    bridge: {
      switchRuntime: mock.fn(),
      getRuntimeKind: mock.fn(() => "local"),
      getProfile: mock.fn(() => ({})),
      isActive: mock.fn(() => false),
      runTurn: mock.fn(),
      events: { on: mock.fn(), off: mock.fn(), emit: mock.fn() },
    } as unknown as CommandContext["bridge"],
    config: {
      runtime: "local",
      model: "ollama:llama3.1:8b",
    },
    output: mockOutput as unknown as OutputWriter,
    exit: mock.fn(),
    updateConfig: mock.fn(),
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMockCalls(fn: any): MockCall[] {
  return fn.mock.calls as MockCall[];
}

describe("Command Registry", () => {
  it("registers and retrieves commands", () => {
    const registry = new CommandRegistry();
    registry.register(runtimeCommand);

    const cmd = registry.get("runtime");
    assert.equal(cmd?.name, "runtime");
  });

  it("retrieves commands by alias", () => {
    const registry = new CommandRegistry();
    registry.register(runtimeCommand);

    const cmd = registry.get("rt");
    assert.equal(cmd?.name, "runtime");
  });

  it("returns undefined for unknown command", () => {
    const registry = new CommandRegistry();
    const cmd = registry.get("unknown");
    assert.equal(cmd, undefined);
  });

  it("lists all registered commands", () => {
    const registry = new CommandRegistry();
    registry.register(runtimeCommand);
    registry.register(exitCommand);

    const all = registry.getAll();
    assert.equal(all.length, 2);
  });

  it("creates default registry with all commands", () => {
    const registry = createDefaultRegistry();
    const all = registry.getAll();
    assert.equal(all.length, 5);
    assert.ok(registry.has("runtime"));
    assert.ok(registry.has("health"));
    assert.ok(registry.has("config"));
    assert.ok(registry.has("help"));
    assert.ok(registry.has("exit"));
  });
});

describe("Runtime Command", () => {
  it("shows current runtime when no args", async () => {
    const ctx = createMockContext();
    await runtimeCommand.execute([], ctx);

    const calls = getMockCalls(ctx.output.writeLine);
    assert.ok(calls.some((c) => c.arguments[0].includes("local")));
  });

  it("switches runtime with valid arg", async () => {
    const ctx = createMockContext();
    await runtimeCommand.execute(["ozwell"], ctx);

    const switchCalls = getMockCalls(ctx.bridge.switchRuntime);
    assert.equal(switchCalls.length, 1);

    const updateCalls = getMockCalls(ctx.updateConfig);
    assert.equal(updateCalls[0].arguments[0].runtime, "ozwell");
  });

  it("rejects invalid runtime", async () => {
    const ctx = createMockContext();
    await runtimeCommand.execute(["invalid"], ctx);

    const switchCalls = getMockCalls(ctx.bridge.switchRuntime);
    assert.equal(switchCalls.length, 0);
  });
});

describe("Config Command", () => {
  it("shows all config when no args", async () => {
    const ctx = createMockContext();
    await configCommand.execute([], ctx);

    const calls = getMockCalls(ctx.output.writeLine);
    assert.ok(calls.some((c) => c.arguments[0].includes("runtime")));
    assert.ok(calls.some((c) => c.arguments[0].includes("model")));
  });

  it("shows specific config key", async () => {
    const ctx = createMockContext();
    await configCommand.execute(["model"], ctx);

    const calls = getMockCalls(ctx.output.writeLine);
    assert.ok(calls.some((c) => c.arguments[0].includes("ollama:llama3.1:8b")));
  });

  it("sets config value", async () => {
    const ctx = createMockContext();
    await configCommand.execute(["model", "new:model"], ctx);

    const updateCalls = getMockCalls(ctx.updateConfig);
    assert.equal(updateCalls[0].arguments[0].model, "new:model");
  });

  it("rejects unknown config key", async () => {
    const ctx = createMockContext();
    await configCommand.execute(["unknown"], ctx);

    const calls = getMockCalls(ctx.output.writeLine);
    assert.ok(calls.some((c) => c.arguments[0].includes("Unknown")));
  });
});

describe("Exit Command", () => {
  it("calls exit function", async () => {
    const ctx = createMockContext();
    await exitCommand.execute([], ctx);

    const exitCalls = getMockCalls(ctx.exit);
    assert.equal(exitCalls.length, 1);
  });
});

describe("Help Command", () => {
  it("lists all commands when no args", async () => {
    const registry = createDefaultRegistry();
    const helpCmd = createHelpCommand(registry);
    const ctx = createMockContext();

    await helpCmd.execute([], ctx);

    const calls = getMockCalls(ctx.output.writeLine);
    assert.ok(calls.some((c) => c.arguments[0].includes("/runtime")));
    assert.ok(calls.some((c) => c.arguments[0].includes("/health")));
  });

  it("shows help for specific command", async () => {
    const registry = createDefaultRegistry();
    const helpCmd = createHelpCommand(registry);
    const ctx = createMockContext();

    await helpCmd.execute(["runtime"], ctx);

    const calls = getMockCalls(ctx.output.writeLine);
    assert.ok(calls.some((c) => c.arguments[0].includes("runtime")));
    assert.ok(calls.some((c) => c.arguments[0].includes("Switch runtime")));
  });

  it("handles unknown command", async () => {
    const registry = createDefaultRegistry();
    const helpCmd = createHelpCommand(registry);
    const ctx = createMockContext();

    await helpCmd.execute(["unknown"], ctx);

    const calls = getMockCalls(ctx.output.writeLine);
    assert.ok(calls.some((c) => c.arguments[0].includes("Unknown command")));
  });
});
