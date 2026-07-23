/**
 * /config command - view or update configuration.
 * Changes are applied to the live bridge and persisted to ~/.config/jerry-term/config.json.
 * API keys are routed into the active credential slot (ozwell or byo.provider).
 */

import type { RuntimeKind } from "@mieweb/jerry-agent-runtime";
import type { Command, CommandContext } from "./types.ts";
import type { TermConfig, ByoProviderId } from "../config/index.ts";
import {
  saveTermConfig,
  setCredential,
  clearCredential,
  fromWireModel,
  getProviderForRuntime,
  maskApiKey,
  toWireModel,
  getDefaultModel,
} from "../config/index.ts";
import { validateCredentials } from "../config/validate-credentials.ts";
import { applyConfigToBridge } from "./apply-config.ts";

const EDITABLE_KEYS: (keyof TermConfig)[] = ["runtime", "model", "apiKey", "endpoint", "egress", "provider"];
const VALID_RUNTIMES: RuntimeKind[] = ["local", "ozwell", "byo-cloud", "anthropic"];
const CLEARABLE_SLOTS = ["ozwell", "openai", "anthropic"] as const;
type ClearableSlot = (typeof CLEARABLE_SLOTS)[number];

export const configCommand: Command = {
  name: "config",
  aliases: ["cfg"],
  description: "View or update configuration (persisted)",
  usage: "/config [key] [value]",

  async execute(args: string[], ctx: CommandContext): Promise<void> {
    if (args.length === 0) {
      const provider = getProviderForRuntime(ctx.config.runtime, ctx.config.provider);

      ctx.output.writeLine("Current configuration:");
      ctx.output.writeLine(`  runtime:  ${ctx.config.runtime}`);
      if (ctx.config.provider) {
        ctx.output.writeLine(`  provider: ${ctx.config.provider}`);
      }
      ctx.output.writeLine(`  model:    ${fromWireModel(ctx.config.model)}`);
      ctx.output.writeLine(`  endpoint: ${ctx.config.endpoint ?? provider?.baseURL ?? "(default)"}`);
      ctx.output.writeLine(`  egress:   ${ctx.config.egress ?? "(default)"}`);
      ctx.output.writeLine(`  apiKey:   ${ctx.config.apiKey ? maskApiKey(ctx.config.apiKey) : "(not set)"}`);
      ctx.output.writeLine("");

      if (ctx.config.credentials) {
        ctx.output.writeLine("Saved credentials:");
        if (ctx.config.credentials.ozwell?.apiKey) {
          ctx.output.writeLine(`  ozwell: ${maskApiKey(ctx.config.credentials.ozwell.apiKey)}`);
        }
        if (ctx.config.credentials.byo) {
          for (const [id, cred] of Object.entries(ctx.config.credentials.byo)) {
            if (cred?.apiKey) {
              ctx.output.writeLine(`  byo/${id}: ${maskApiKey(cred.apiKey)}`);
            }
          }
        }
        ctx.output.writeLine("");
      }

      ctx.output.writeLine("Changes take effect on the next turn and are saved to config file.");
      ctx.output.writeLine("Note: apiKey is saved to the active runtime/provider credential slot.");
      ctx.output.writeLine("Use /config clearKey [ozwell|openai|anthropic] to remove a saved key.");
      return;
    }

    if (args[0] === "clearKey") {
      return handleClearKey(args.slice(1), ctx);
    }

    const key = args[0] as keyof TermConfig;
    if (!EDITABLE_KEYS.includes(key)) {
      ctx.output.writeLine(`Unknown config key: ${key}`);
      ctx.output.writeLine(`Available keys: ${EDITABLE_KEYS.join(", ")}`);
      return;
    }

    if (args.length === 1) {
      const value = ctx.config[key];
      if (key === "apiKey" && value) {
        ctx.output.writeLine(`${key}: ${maskApiKey(value as string)}`);
      } else if (key === "model") {
        ctx.output.writeLine(`${key}: ${fromWireModel(value as string)}`);
      } else {
        ctx.output.writeLine(`${key}: ${value ?? "(not set)"}`);
      }
      return;
    }

    const value = args.slice(1).join(" ");

    if (key === "runtime" && !VALID_RUNTIMES.includes(value as RuntimeKind)) {
      ctx.output.writeLine(`Invalid runtime: ${value}`);
      ctx.output.writeLine(`Available: ${VALID_RUNTIMES.join(", ")}`);
      return;
    }

    if (key === "apiKey" && value === "clear") {
      return handleClearActiveKey(ctx);
    }

    let next: TermConfig = { ...ctx.config };

    if (key === "apiKey") {
      // Validate API key before saving
      ctx.output.writeLine("Validating API key...");
      const validation = await validateCredentials(
        ctx.config.runtime,
        ctx.config.provider,
        value,
        ctx.config.endpoint
      );

      if (!validation.valid) {
        ctx.output.writeLine(`Error: ${validation.error}`);
        ctx.output.writeLine("API key was not saved.");
        return;
      }

      next = setCredential(
        next,
        ctx.config.runtime,
        ctx.config.provider,
        {
          apiKey: value,
          baseURL: ctx.config.endpoint,
          endpoint: ctx.config.endpoint,
        }
      );
      next.apiKey = value;
    } else {
      next = { ...next, [key]: value };
    }

    ctx.updateConfig(next);
    applyConfigToBridge(ctx.bridge, next);

    const doSave = ctx.saveConfig ?? saveTermConfig;
    try {
      doSave(next);
      if (key === "apiKey") {
        const slot =
          ctx.config.runtime === "byo-cloud" && ctx.config.provider
            ? `byo/${ctx.config.provider}`
            : ctx.config.runtime;
        ctx.output.writeLine(`Set ${key} = ${maskApiKey(value)} (saved to ${slot} credential slot)`);
      } else {
        ctx.output.writeLine(`Set ${key} = ${value} (saved)`);
      }
    } catch (err) {
      ctx.output.writeLine(`Set ${key} = ${key === "apiKey" ? maskApiKey(value) : value} (in-memory only, save failed)`);
    }
  },
};

function handleClearActiveKey(ctx: CommandContext): void {
  if (ctx.config.runtime === "local") {
    ctx.output.writeLine("Local runtime does not use API keys.");
    return;
  }

  let slot: string;
  if (ctx.config.runtime === "anthropic") {
    slot = "anthropic";
  } else if (ctx.config.runtime === "byo-cloud" && ctx.config.provider) {
    slot = `byo/${ctx.config.provider}`;
  } else {
    slot = ctx.config.runtime;
  }

  const runtime = ctx.config.runtime as RuntimeKind;
  const provider = ctx.config.provider as ByoProviderId | undefined;

  let next = clearCredential(ctx.config, runtime, provider);

  // Since we're clearing the active key, switch to local runtime
  const defaultModel = getDefaultModel("ollama");
  next = {
    ...next,
    runtime: "local",
    provider: undefined,
    model: toWireModel("local", defaultModel),
    apiKey: undefined,
    endpoint: undefined,
  };

  ctx.updateConfig(next);
  applyConfigToBridge(ctx.bridge, next);

  const doSave = ctx.saveConfig ?? saveTermConfig;
  try {
    doSave(next);
    ctx.output.writeLine(`Cleared API key from ${slot} credential slot (saved)`);
    ctx.output.writeLine(`Switched to local runtime with model: ${defaultModel}`);
  } catch {
    ctx.output.writeLine(`Cleared API key from ${slot} (in-memory only, save failed)`);
  }
}

function handleClearKey(args: string[], ctx: CommandContext): void {
  if (args.length === 0) {
    ctx.output.writeLine("Usage: /config clearKey [ozwell|openai|anthropic]");
    ctx.output.writeLine(`Available slots: ${CLEARABLE_SLOTS.join(", ")}`);
    return;
  }

  const slot = args[0] as ClearableSlot;
  if (!CLEARABLE_SLOTS.includes(slot)) {
    ctx.output.writeLine(`Unknown credential slot: ${slot}`);
    ctx.output.writeLine(`Available: ${CLEARABLE_SLOTS.join(", ")}`);
    return;
  }

  let runtime: RuntimeKind;
  let provider: ByoProviderId | undefined;

  if (slot === "ozwell") {
    runtime = "ozwell";
    provider = undefined;
    if (!ctx.config.credentials?.ozwell?.apiKey) {
      ctx.output.writeLine("No Ozwell API key saved.");
      return;
    }
  } else if (slot === "anthropic") {
    runtime = "anthropic";
    provider = "anthropic";
    if (!ctx.config.credentials?.byo?.anthropic?.apiKey) {
      ctx.output.writeLine("No Anthropic API key saved.");
      return;
    }
  } else {
    runtime = "byo-cloud";
    provider = slot as ByoProviderId;
    if (!ctx.config.credentials?.byo?.[provider]?.apiKey) {
      ctx.output.writeLine(`No ${slot} API key saved.`);
      return;
    }
  }

  let next = clearCredential(ctx.config, runtime, provider);

  // Check if we're clearing the key for the currently active runtime/provider
  const isActiveRuntime =
    (ctx.config.runtime === "ozwell" && slot === "ozwell") ||
    (ctx.config.runtime === "anthropic" && slot === "anthropic") ||
    (ctx.config.runtime === "byo-cloud" && ctx.config.provider === slot);

  if (isActiveRuntime) {
    // Switch to local runtime since we're clearing the active key
    const defaultModel = getDefaultModel("ollama");
    next = {
      ...next,
      runtime: "local",
      provider: undefined,
      model: toWireModel("local", defaultModel),
      apiKey: undefined,
      endpoint: undefined,
    };
  }

  ctx.updateConfig(next);
  applyConfigToBridge(ctx.bridge, next);

  const doSave = ctx.saveConfig ?? saveTermConfig;
  try {
    doSave(next);
    ctx.output.writeLine(`Cleared ${slot} API key (saved)`);
    if (isActiveRuntime) {
      const defaultModel = getDefaultModel("ollama");
      ctx.output.writeLine(`Switched to local runtime with model: ${defaultModel}`);
    }
  } catch {
    ctx.output.writeLine(`Cleared ${slot} API key (in-memory only, save failed)`);
  }
}
