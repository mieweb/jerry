/**
 * /runtime command - switch runtime backend.
 * Opens interactive picker when called without args.
 * Supports direct switch: /runtime local|ozwell|byo [provider]
 */

import type { RuntimeKind } from "@mieweb/jerry-agent-runtime";
import type { Command, CommandContext } from "./types.ts";
import type { ByoProviderId } from "../config/index.ts";
import {
  saveTermConfig,
  getRuntimeAvailability,
  getByoProviderAvailability,
  switchRuntime,
  getProviderForRuntime,
  fromWireModel,
} from "../config/index.ts";

const VALID_RUNTIMES: RuntimeKind[] = ["local", "ozwell", "byo-cloud"];
const VALID_BYO_PROVIDERS: ByoProviderId[] = ["openai", "moonshot", "custom"];

export const runtimeCommand: Command = {
  name: "runtime",
  aliases: ["rt"],
  description: "Switch runtime: local, ozwell, byo-cloud",
  usage: "/runtime [kind] [provider]",

  async execute(args: string[], ctx: CommandContext): Promise<void> {
    if (args.length === 0) {
      if (ctx.openPicker) {
        ctx.openPicker({ mode: "runtime" });
        return;
      }

      const current = ctx.bridge.getRuntimeKind();
      const availability = getRuntimeAvailability(ctx.config);

      ctx.output.writeLine(`Current runtime: ${current}`);
      ctx.output.writeLine(`Current model:   ${fromWireModel(ctx.config.model)}`);
      if (ctx.config.runtime === "byo-cloud" && ctx.config.provider) {
        ctx.output.writeLine(`Current provider: ${ctx.config.provider}`);
      }
      ctx.output.writeLine("");
      ctx.output.writeLine("Available runtimes:");

      for (const rt of availability) {
        const isCurrent = rt.kind === current;
        const marker = isCurrent ? "*" : " ";
        const status = rt.available ? "ready" : "not configured";
        const provider = getProviderForRuntime(rt.kind, undefined);

        let details = `[${status}]`;
        if (rt.kind === "local") {
          details += ` model: ${rt.model}`;
        } else if (rt.hasApiKey) {
          details += " API key: set";
          if (rt.endpoint) {
            details += `, endpoint: ${rt.endpoint}`;
          }
        } else {
          details += ` (setup via /runtime ${rt.kind} or docs: ${provider?.docsURL ?? "N/A"})`;
        }

        ctx.output.writeLine(`  ${marker} ${rt.kind.padEnd(10)} ${details}`);
      }

      if (current === "byo-cloud" || availability.find((r) => r.kind === "byo-cloud")?.available) {
        ctx.output.writeLine("");
        ctx.output.writeLine("BYO providers:");
        const byoAvail = getByoProviderAvailability(ctx.config);
        for (const p of byoAvail) {
          const isCurrent =
            ctx.config.runtime === "byo-cloud" && ctx.config.provider === p.id;
          const marker = isCurrent ? "*" : " ";
          const status = p.hasApiKey ? "ready" : "not configured";
          ctx.output.writeLine(
            `  ${marker} ${p.id.padEnd(10)} [${status}]${p.lastModel ? ` last: ${p.lastModel}` : ""}`
          );
        }
      }

      ctx.output.writeLine("");
      ctx.output.writeLine("Usage: /runtime <kind> [provider]  (e.g., /runtime byo openai)");
      return;
    }

    const kind = args[0] as RuntimeKind;
    if (!VALID_RUNTIMES.includes(kind)) {
      ctx.output.writeLine(`Invalid runtime: ${kind}`);
      ctx.output.writeLine(`Available: ${VALID_RUNTIMES.join(", ")}`);
      return;
    }

    let provider: ByoProviderId | undefined;
    if (kind === "byo-cloud") {
      if (args.length > 1) {
        const p = args[1] as ByoProviderId;
        if (!VALID_BYO_PROVIDERS.includes(p)) {
          ctx.output.writeLine(`Invalid BYO provider: ${p}`);
          ctx.output.writeLine(`Available: ${VALID_BYO_PROVIDERS.join(", ")}`);
          return;
        }
        provider = p;
      } else {
        provider = ctx.config.provider ?? "openai";
      }
    }

    const doSave = ctx.saveConfig ?? saveTermConfig;
    const result = switchRuntime(ctx.bridge, ctx.config, kind, provider, doSave);

    if (!result.success) {
      if (result.needsSetup) {
        if (ctx.openPicker) {
          ctx.openPicker({ mode: "setup", runtime: kind, provider });
          return;
        }
        ctx.output.writeLine(result.message);
        if (result.setupDocsURL) {
          ctx.output.writeLine(`Setup docs: ${result.setupDocsURL}`);
        }
        ctx.output.writeLine(`Set API key with: /config apiKey <your-key>`);
      } else {
        ctx.output.writeLine(result.message);
      }
      return;
    }

    ctx.updateConfig({
      runtime: kind,
      provider,
      model: result.config.model,
      apiKey: result.config.apiKey,
      endpoint: result.config.endpoint,
    });

    const savedMsg = result.saved ? "(saved)" : "(in-memory only)";
    if (provider) {
      ctx.output.writeLine(
        `Switched to ${kind}/${provider} with model: ${fromWireModel(result.config.model)} ${savedMsg}`
      );
    } else {
      ctx.output.writeLine(
        `Switched to ${kind} with model: ${fromWireModel(result.config.model)} ${savedMsg}`
      );
    }
  },
};
