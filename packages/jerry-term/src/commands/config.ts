/**
 * /config command - view or update configuration.
 * Changes are applied to the live bridge and persisted to ~/.config/jerry-term/config.json.
 * API keys are routed into the active credential slot (ozwell or byo.provider).
 */

import type { RuntimeKind } from "@mieweb/jerry-agent-runtime";
import type { Command, CommandContext } from "./types.ts";
import type { TermConfig } from "../config/index.ts";
import {
  saveTermConfig,
  setCredential,
  fromWireModel,
  getProviderForRuntime,
} from "../config/index.ts";
import { applyConfigToBridge } from "./apply-config.ts";

const EDITABLE_KEYS: (keyof TermConfig)[] = ["runtime", "model", "apiKey", "endpoint", "egress", "provider"];
const VALID_RUNTIMES: RuntimeKind[] = ["local", "ozwell", "byo-cloud"];

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
      ctx.output.writeLine(`  apiKey:   ${ctx.config.apiKey ? "***" : "(not set)"}`);
      ctx.output.writeLine("");

      if (ctx.config.credentials) {
        ctx.output.writeLine("Saved credentials:");
        if (ctx.config.credentials.ozwell?.apiKey) {
          ctx.output.writeLine("  ozwell: ***");
        }
        if (ctx.config.credentials.byo) {
          for (const [id, cred] of Object.entries(ctx.config.credentials.byo)) {
            if (cred?.apiKey) {
              ctx.output.writeLine(`  byo/${id}: ***`);
            }
          }
        }
        ctx.output.writeLine("");
      }

      ctx.output.writeLine("Changes take effect on the next turn and are saved to config file.");
      ctx.output.writeLine("Note: apiKey is saved to the active runtime/provider credential slot.");
      return;
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
        ctx.output.writeLine(`${key}: ***`);
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

    let next: TermConfig = { ...ctx.config };

    if (key === "apiKey") {
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
        ctx.output.writeLine(`Set ${key} = *** (saved to ${slot} credential slot)`);
      } else {
        ctx.output.writeLine(`Set ${key} = ${value} (saved)`);
      }
    } catch (err) {
      ctx.output.writeLine(`Set ${key} = ${key === "apiKey" ? "***" : value} (in-memory only, save failed)`);
    }
  },
};
