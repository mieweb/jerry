/**
 * Greeting detection for the Jerry CLI.
 *
 * A bare greeting (`jerry hello`, `jerry hi jerry`) opens the interactive
 * REPL. A greeting followed by a task (`jerry hi jerry summarize my day`)
 * is a normal one-shot message and must not be swallowed by the REPL.
 */

const GREETING_PATTERN = /^(hi|hey|hello|yo)\b[\s,!.]*(jerry)?[\s,!.]*$/i;

/**
 * Collapse whitespace and trim so `argv` joins compare predictably.
 */
export function normalizeMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}

/**
 * True only when the *entire* message is a greeting.
 */
export function isGreeting(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (normalized === "") return false;
  return GREETING_PATTERN.test(normalized);
}
