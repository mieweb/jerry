import type { ToolSet } from "ai";
import type { PrivacyProfile } from "../types.ts";

/**
 * Filter tools based on egress policy and tool dispositions.
 *
 * When `egress: deny`, only tools marked as `local` in the profile are allowed.
 * When `egress: allow-model`, same as deny (model calls allowed, not tool network access).
 * When `egress: allow-tools`, all tools are allowed (per-tool dispositions apply at call time).
 */
export function filterTools(
  tools: ToolSet | undefined,
  profile: PrivacyProfile
): ToolSet | undefined {
  if (!tools) return undefined;

  // allow-tools mode: all tools pass through, per-tool gating happens at call time
  if (profile.egress === "allow-tools") {
    return tools;
  }

  // deny or allow-model: only allow tools marked as "local"
  const toolDispositions = profile.tools ?? {};
  const filtered: ToolSet = {};

  for (const [name, tool] of Object.entries(tools)) {
    const disposition = toolDispositions[name];
    if (disposition === "local") {
      filtered[name] = tool;
    }
    // Tools with "ask" or "allow" disposition, or unknown tools, are dropped in deny/allow-model mode
  }

  return Object.keys(filtered).length > 0 ? filtered : undefined;
}
