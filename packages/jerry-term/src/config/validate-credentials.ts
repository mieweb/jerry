/**
 * Validate API credentials by attempting to list models.
 * Returns auth errors immediately; treats service unavailable as "possibly valid".
 */

import type { RuntimeKind } from "@mieweb/jerry-agent-runtime";
import type { ByoProviderId } from "./types.ts";
import { listOpenAIModels } from "./list-openai-models.ts";
import { listAnthropicModels } from "./list-anthropic-models.ts";
import { listOzwellModels } from "./list-ozwell-models.ts";

export interface ValidateCredentialsResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate credentials for a runtime/provider by attempting to list models.
 * - Returns { valid: true } if the API key works or if service is unavailable (benefit of doubt)
 * - Returns { valid: false, error } if authentication fails (invalid key)
 */
export async function validateCredentials(
  runtime: RuntimeKind,
  provider: ByoProviderId | undefined,
  apiKey: string,
  baseURL?: string
): Promise<ValidateCredentialsResult> {
  if (runtime === "local") {
    return { valid: true };
  }

  if (runtime === "ozwell") {
    // Ozwell has a fallback model list, so we can't reliably validate the key
    // Just accept it and let runtime errors surface during actual use
    return { valid: true };
  }

  if (runtime === "anthropic" || provider === "anthropic") {
    const result = await listAnthropicModels({ apiKey });
    if (!result.ok && result.errorKind === "auth") {
      return {
        valid: false,
        error: "Invalid Anthropic API key. Please check your key and try again.",
      };
    }
    return { valid: true };
  }

  if (runtime === "byo-cloud" && provider === "openai") {
    const result = await listOpenAIModels({ apiKey, baseURL });
    if (!result.ok && result.errorKind === "auth") {
      return {
        valid: false,
        error: "Invalid OpenAI API key. Please check your key and try again.",
      };
    }
    return { valid: true };
  }

  // For custom providers or unknown cases, assume valid (can't validate without knowing the API)
  return { valid: true };
}
