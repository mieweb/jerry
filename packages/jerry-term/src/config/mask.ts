/**
 * API key masking utilities.
 * Format: first 4 chars + **** + last 4 chars (or **** if key length < 8)
 */

/**
 * Mask an API key for display purposes.
 * Shows first 4 + **** + last 4 characters for keys >= 8 chars.
 * Returns "****" for shorter keys or empty/undefined input.
 */
export function maskApiKey(key: string | undefined): string {
  if (!key || key.length < 8) {
    return "****";
  }
  const first = key.slice(0, 4);
  const last = key.slice(-4);
  return `${first}****${last}`;
}
