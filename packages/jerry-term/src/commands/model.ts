/**
 * /model command - switch model within current runtime/provider.
 * Opens interactive picker when called without args.
 * Supports direct switch: /model <id>
 */

import type { Command, CommandContext } from "./types.ts";
import {
  saveTermConfig,
  switchModel,
  fromWireModel,
  getProviderForRuntime,
  listOzwellModels,
  partitionOzwellModels,
} from "../config/index.ts";
import { listOllamaModels } from "../health/index.ts";

export const modelCommand: Command = {
  name: "model",
  aliases: ["m"],
  description: "Switch model for current runtime",
  usage: "/model [id]",

  async execute(args: string[], ctx: CommandContext): Promise<void> {
    const provider = getProviderForRuntime(ctx.config.runtime, ctx.config.provider);

    if (args.length === 0) {
      if (ctx.openPicker) {
        ctx.openPicker({
          mode: "model",
          runtime: ctx.config.runtime,
          provider: ctx.config.provider,
        });
        return;
      }

      ctx.output.writeLine(`Current runtime: ${ctx.config.runtime}`);
      if (ctx.config.provider) {
        ctx.output.writeLine(`Current provider: ${ctx.config.provider}`);
      }
      ctx.output.writeLine(`Current model: ${fromWireModel(ctx.config.model)}`);
      ctx.output.writeLine("");

      if (ctx.config.runtime === "local") {
        const listed = await listOllamaModels();
        if (!listed.ok) {
          ctx.output.writeLine(`Ollama unavailable: ${listed.error ?? "not running"}`);
          ctx.output.writeLine("Start Ollama, then run /model again.");
        } else if (listed.models.length === 0) {
          ctx.output.writeLine("No Ollama models installed.");
          ctx.output.writeLine("Install one with: ollama pull llama3.1:8b");
        } else {
          ctx.output.writeLine("Available Ollama models:");
          const current = fromWireModel(ctx.config.model);
          for (const m of listed.models) {
            const marker = m === current ? "*" : " ";
            ctx.output.writeLine(`  ${marker} ${m}`);
          }
        }
        ctx.output.writeLine("");
      } else if (ctx.config.runtime === "ozwell") {
        const listed = await listOzwellModels({
          apiKey:
            process.env.OZWELL_API_KEY ??
            process.env.OZWELL_AGENT_KEY ??
            process.env.JERRY_API_KEY ??
            ctx.config.credentials?.ozwell?.apiKey ??
            ctx.config.apiKey,
          endpoint:
            process.env.JERRY_ENDPOINT ??
            process.env.OZWELL_ENDPOINT ??
            ctx.config.credentials?.ozwell?.endpoint ??
            ctx.config.endpoint,
        });
        const source = listed.usedFallback ? "curated fallback" : "live from Ozwell";
        ctx.output.writeLine(`Available Ozwell models (${source}):`);
        if (!listed.ok && listed.error) {
          ctx.output.writeLine(`  (live fetch: ${listed.error})`);
        }
        const current = fromWireModel(ctx.config.model);
        const { recommended, other } = partitionOzwellModels(
          listed.models,
          current
        );
        ctx.output.writeLine("Recommended:");
        for (const m of recommended) {
          const marker = m.id === current ? "*" : " ";
          const desc = m.description ? ` - ${m.description}` : "";
          ctx.output.writeLine(`  ${marker} ${m.id}${desc}`);
        }
        if (other.length > 0) {
          ctx.output.writeLine(
            `Other: ${other.length} models (open /model picker to expand, or /model <id>)`
          );
        }
        ctx.output.writeLine("");
      } else if (provider?.models.length) {
        ctx.output.writeLine("Available models:");
        for (const m of provider.models) {
          const isCurrent = fromWireModel(ctx.config.model) === m.id;
          const marker = isCurrent ? "*" : " ";
          const desc = m.description ? ` - ${m.description}` : "";
          ctx.output.writeLine(`  ${marker} ${m.id}${desc}`);
        }
        ctx.output.writeLine("");
      }

      ctx.output.writeLine("Usage: /model <id>");
      return;
    }

    const modelId = args.join(" ");
    const doSave = ctx.saveConfig ?? saveTermConfig;
    const result = switchModel(ctx.bridge, ctx.config, modelId, undefined, doSave);

    ctx.updateConfig({
      model: result.config.model,
      lastModel: result.config.lastModel,
    });

    const savedMsg = result.saved ? "(saved)" : "(in-memory only)";
    ctx.output.writeLine(`Model set to ${modelId} ${savedMsg}`);
  },
};
