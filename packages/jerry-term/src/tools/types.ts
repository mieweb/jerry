/**
 * Local tool context types for jerry-term.
 *
 * Unlike the Cloudflare Worker ToolContext, this uses direct HTTP calls
 * to local services like ActivityWatch.
 */

export interface LocalToolContext {
  /** ActivityWatch base URL (default: http://127.0.0.1:5600) */
  awUrl: string;
  /** Fetch function (injectable for tests) */
  fetchFn: typeof fetch;
}

export const DEFAULT_AW_URL = "http://127.0.0.1:5600";

export function createLocalToolContext(
  options?: Partial<LocalToolContext>
): LocalToolContext {
  return {
    awUrl: options?.awUrl ?? process.env.AW_URL ?? DEFAULT_AW_URL,
    fetchFn: options?.fetchFn ?? fetch,
  };
}
