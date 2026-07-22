/**
 * Configuration types for jerry-term.
 */

import type { RuntimeKind, PrivacyProfile } from "@mieweb/jerry-agent-runtime";

export interface TermConfig {
  /** Runtime kind: local, ozwell, byo-cloud */
  runtime: RuntimeKind;
  /** Model identifier (e.g., "ollama:llama3.1:8b") */
  model: string;
  /** API key for ozwell/byo-cloud endpoints */
  apiKey?: string;
  /** Custom endpoint URL */
  endpoint?: string;
  /** Egress policy */
  egress?: string;
}

export interface TermConfigFile {
  runtime?: string;
  model?: string;
  apiKey?: string;
  endpoint?: string;
  egress?: string;
}

export function termConfigToProfile(config: TermConfig): Partial<PrivacyProfile> {
  return {
    runtime: config.runtime,
    model: config.model,
    apiKey: config.apiKey,
    endpoint: config.endpoint,
    egress: config.egress as PrivacyProfile["egress"],
  };
}
