import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { CommandRegistry } from "./registry.ts";
import { runtimeCommand } from "./runtime.ts";
import { modelCommand } from "./model.ts";
import { configCommand } from "./config.ts";
import { exitCommand } from "./exit.ts";
import { awTailCommand } from "./aw.ts";
import { createHelpCommand } from "./help.ts";
import { createDefaultRegistry } from "./index.ts";
import type { CommandContext } from "./types.ts";
import type { OutputWriter } from "../repl/output.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockCall = { arguments: any[] };

function createMockContext(
    overrides?: Partial<CommandContext>,
): CommandContext {
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
        saveConfig: mock.fn() as unknown as CommandContext["saveConfig"],
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
        assert.equal(all.length, 7);
        assert.ok(registry.has("runtime"));
        assert.ok(registry.has("model"));
        assert.ok(registry.has("health"));
        assert.ok(registry.has("aw-tail"));
        assert.ok(registry.has("aw"));
        assert.ok(registry.has("config"));
        assert.ok(registry.has("help"));
        assert.ok(registry.has("exit"));
    });
});

describe("AW Tail Command", () => {
    it("reports unreachable ActivityWatch", async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock.fn(() =>
            Promise.reject(new Error("fetch failed: ECONNREFUSED")),
        ) as unknown as typeof fetch;

        try {
            const ctx = createMockContext();
            await awTailCommand.execute([], ctx);

            const calls = getMockCalls(ctx.output.writeLine);
            assert.ok(
                calls.some((c) =>
                    String(c.arguments[0]).includes("Unreachable"),
                ),
            );
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

describe("Runtime Command", () => {
    it("shows current runtime when no args", async () => {
        const ctx = createMockContext();
        await runtimeCommand.execute([], ctx);

        const calls = getMockCalls(ctx.output.writeLine);
        assert.ok(calls.some((c) => c.arguments[0].includes("local")));
    });

    it("switches runtime with valid arg and passes profile options", async () => {
        const ctx = createMockContext({
            config: {
                runtime: "local",
                model: "ollama:llama3.1:8b",
                apiKey: "test-key",
                endpoint: "https://test.endpoint",
                credentials: {
                    ozwell: {
                        apiKey: "ozw_test",
                        endpoint: "https://test.endpoint",
                    },
                },
            },
        });
        await runtimeCommand.execute(["ozwell"], ctx);

        const switchCalls = getMockCalls(ctx.bridge.switchRuntime);
        assert.equal(switchCalls.length, 1);
        assert.equal(switchCalls[0].arguments[0], "ozwell");
        const profileOpts = switchCalls[0].arguments[1];
        assert.equal(profileOpts.runtime, "ozwell");

        const updateCalls = getMockCalls(ctx.updateConfig);
        assert.equal(updateCalls[0].arguments[0].runtime, "ozwell");
    });

    it("switches runtime with byo provider", async () => {
        const ctx = createMockContext({
            config: {
                runtime: "local",
                model: "ollama:llama3.1:8b",
                credentials: {
                    byo: { openai: { apiKey: "sk_test" } },
                },
            },
        });
        await runtimeCommand.execute(["byo-cloud", "openai"], ctx);

        const switchCalls = getMockCalls(ctx.bridge.switchRuntime);
        assert.equal(switchCalls.length, 1);
        assert.equal(switchCalls[0].arguments[0], "byo-cloud");

        const updateCalls = getMockCalls(ctx.updateConfig);
        assert.equal(updateCalls[0].arguments[0].runtime, "byo-cloud");
        assert.equal(updateCalls[0].arguments[0].provider, "openai");
    });

    it("rejects invalid runtime", async () => {
        const ctx = createMockContext();
        await runtimeCommand.execute(["invalid"], ctx);

        const switchCalls = getMockCalls(ctx.bridge.switchRuntime);
        assert.equal(switchCalls.length, 0);
    });

    it("shows runtime availability status", async () => {
        const ctx = createMockContext();
        await runtimeCommand.execute([], ctx);

        const calls = getMockCalls(ctx.output.writeLine);
        assert.ok(
            calls.some((c) => c.arguments[0].includes("Available runtimes")),
        );
        assert.ok(calls.some((c) => c.arguments[0].includes("local")));
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
        assert.ok(calls.some((c) => c.arguments[0].includes("llama3.1:8b")));
    });

    it("sets config value and applies to bridge", async () => {
        const ctx = createMockContext();
        await configCommand.execute(["model", "new:model"], ctx);

        const updateCalls = getMockCalls(ctx.updateConfig);
        assert.equal(updateCalls[0].arguments[0].model, "new:model");

        const switchCalls = getMockCalls(ctx.bridge.switchRuntime);
        assert.equal(switchCalls.length, 1);
        assert.equal(switchCalls[0].arguments[0], "local");
        const profileOpts = switchCalls[0].arguments[1];
        assert.equal(profileOpts.model, "new:model");
    });

    it("sets apiKey and applies to bridge with masked output", async () => {
        const ctx = createMockContext();
        await configCommand.execute(["apiKey", "secret-key-123"], ctx);

        const switchCalls = getMockCalls(ctx.bridge.switchRuntime);
        assert.equal(switchCalls.length, 1);
        const profileOpts = switchCalls[0].arguments[1];
        assert.equal(profileOpts.apiKey, "secret-key-123");

        const outputCalls = getMockCalls(ctx.output.writeLine);
        assert.ok(outputCalls.some((c) => c.arguments[0].includes("***")));
        assert.ok(
            !outputCalls.some((c) => c.arguments[0].includes("secret-key-123")),
        );
    });

    it("sets endpoint and applies to bridge", async () => {
        const ctx = createMockContext();
        await configCommand.execute(["endpoint", "https://custom.api"], ctx);

        const switchCalls = getMockCalls(ctx.bridge.switchRuntime);
        assert.equal(switchCalls.length, 1);
        const profileOpts = switchCalls[0].arguments[1];
        assert.equal(profileOpts.endpoint, "https://custom.api");
    });

    it("rejects invalid runtime value", async () => {
        const ctx = createMockContext();
        await configCommand.execute(["runtime", "invalid"], ctx);

        const switchCalls = getMockCalls(ctx.bridge.switchRuntime);
        assert.equal(switchCalls.length, 0);

        const outputCalls = getMockCalls(ctx.output.writeLine);
        assert.ok(
            outputCalls.some((c) => c.arguments[0].includes("Invalid runtime")),
        );
    });

    it("rejects unknown config key", async () => {
        const ctx = createMockContext();
        await configCommand.execute(["unknown"], ctx);

        const calls = getMockCalls(ctx.output.writeLine);
        assert.ok(calls.some((c) => c.arguments[0].includes("Unknown")));
    });

    it("clearKey falls back to local runtime when clearing active provider", async () => {
        const ctx = createMockContext({
            config: {
                runtime: "byo-cloud",
                provider: "openai",
                model: "https://api.openai.com/v1#gpt-3.5-turbo",
                credentials: {
                    byo: {
                        openai: { apiKey: "sk_test123" },
                    },
                },
            },
        });

        await configCommand.execute(["clearKey", "openai"], ctx);

        const updateCalls = getMockCalls(ctx.updateConfig);
        assert.equal(updateCalls.length, 1);
        assert.equal(updateCalls[0].arguments[0].runtime, "local");
        assert.equal(updateCalls[0].arguments[0].provider, undefined);

        const switchCalls = getMockCalls(ctx.bridge.switchRuntime);
        assert.equal(switchCalls.length, 1);
        assert.equal(switchCalls[0].arguments[0], "local");

        const outputCalls = getMockCalls(ctx.output.writeLine);
        assert.ok(outputCalls.some((c) => c.arguments[0].includes("Cleared openai")));
        assert.ok(outputCalls.some((c) => c.arguments[0].includes("Switched to local")));
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
        assert.ok(
            calls.some((c) => c.arguments[0].includes("Unknown command")),
        );
    });
});

describe("Model Command", () => {
    it("shows current model when no args and no picker", async () => {
        const ctx = createMockContext();
        await modelCommand.execute([], ctx);

        const calls = getMockCalls(ctx.output.writeLine);
        assert.ok(calls.some((c) => c.arguments[0].includes("Current")));
        assert.ok(calls.some((c) => c.arguments[0].includes("model")));
    });

    it("opens picker when available", async () => {
        const openPicker = mock.fn();
        const ctx = createMockContext({ openPicker });
        await modelCommand.execute([], ctx);

        const pickerCalls = getMockCalls(openPicker);
        assert.equal(pickerCalls.length, 1);
        assert.equal(pickerCalls[0].arguments[0].mode, "model");
    });

    it("sets model with arg", async () => {
        const ctx = createMockContext();
        await modelCommand.execute(["gpt-4o"], ctx);

        const updateCalls = getMockCalls(ctx.updateConfig);
        assert.ok(updateCalls.length > 0);

        const outputCalls = getMockCalls(ctx.output.writeLine);
        assert.ok(outputCalls.some((c) => c.arguments[0].includes("gpt-4o")));
    });

    it("uses alias /m", () => {
        assert.ok(modelCommand.aliases?.includes("m"));
    });
});
