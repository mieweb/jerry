/**
 * Interactive session mode for the Jerry CLI.
 *
 * A thin `readline` loop over the same HTTP client the one-shot path uses.
 * The worker returns one JSON blob per turn, so a turn renders as
 * "…working…" until the reply arrives, then the reply, then the tools Jerry
 * actually called (from `toolsUsed` on the finish event).
 */

import { createInterface } from "node:readline";
import { streamCall } from "@mieweb/cloud-agent-cli";
import {
  describeProfile,
  getCwdContext,
  loadConfig,
  type ProfileSummary,
} from "./profile.js";

const PROMPT = "jerry \u203a ";
const WORKING = "\u2026working\u2026";
const SEPARATOR = " \u00b7 ";
const EXIT_WORDS = new Set(["q", "quit", "exit"]);
const SPINNER_FRAMES = ["\u280b", "\u2819", "\u2839", "\u2838", "\u283c", "\u2834", "\u2826", "\u2827", "\u2807", "\u280f"];

/**
 * Human labels for the source of truth behind each tool, used for the
 * optional `sources:` gloss. The authoritative line is still the tool names.
 */
const TOOL_SOURCES: Record<string, string> = {
  summarize_activity: "ActivityWatch",
  search_memory: "local index",
  search_hybrid: "local notes",
  search_fts: "local notes",
  search_literal: "local notes",
  read_document: "local files",
  read_file: "local files",
  list_watched: "local files",
  index_document: "local index",
  schedule_followup: "scheduler",
};

/**
 * Tools Jerry may reach for. The server decides which actually run (egress
 * profile, MCP availability), so this is only used for `/dryrun`.
 */
const CANDIDATE_TOOLS = Object.keys(TOOL_SOURCES);

export interface ReplOptions {
  /** Resume an existing session instead of starting a new one. */
  sessionId?: string;
}

/** State the slash-commands are allowed to read. */
export interface ReplContext {
  sessionId: string;
  url: string;
  profile: ProfileSummary;
}

export type SlashResult =
  | { kind: "output"; lines: string[] }
  | { kind: "exit"; lines: string[] }
  | { kind: "new-session"; sessionId: string; lines: string[] };

/**
 * Same shape the server generates, so resume is symmetric.
 */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isExitCommand(line: string): boolean {
  return EXIT_WORDS.has(line.trim().toLowerCase());
}

function useColor(): boolean {
  return !process.env.NO_COLOR;
}

function dim(text: string, color: boolean): string {
  return color ? `\u001b[2m${text}\u001b[0m` : text;
}

function bold(text: string, color: boolean): string {
  return color ? `\u001b[1m${text}\u001b[0m` : text;
}

/**
 * Indent a (possibly multi-line) block so replies line up with the prompt.
 */
function indent(text: string): string[] {
  return text.replace(/\s+$/, "").split("\n").map((line) => `  ${line}`);
}

/**
 * Welcome banner: resolved profile, session ID, resume hint, exit keys.
 */
export function renderBanner(
  context: ReplContext,
  options: { resumed?: boolean; color?: boolean } = {}
): string[] {
  const color = options.color ?? useColor();
  const { profile, sessionId } = context;

  const opening = options.resumed
    ? "Resuming where we left off — this session's history is still on the server."
    : "Hi — I report on what your activity signals actually show, and I say so when a source has no evidence. Ask me about your work.";

  return [
    "",
    `  ${bold("Jerry", color)}${dim(" \u00b7 your value advocate", color)}`,
    "",
    `  ${dim("runtime", color)}  ${profile.runtime}${dim("   model", color)}  ${profile.model}${dim("   egress", color)}  ${profile.egress}`,
    `  ${dim("session", color)}  ${sessionId}   ${dim(`resume: jerry --session ${sessionId}`, color)}`,
    "",
    ...indent(opening),
    `  ${dim("End anytime with  q \u00b7 exit \u00b7 Ctrl+C   \u00b7   /help for commands", color)}`,
    "",
  ];
}

/**
 * Post-answer audit line: every tool Jerry called this turn, in call order.
 * Returns an empty array when no tools ran (pure conversational reply).
 */
export function renderToolsFooter(
  toolsUsed: string[],
  options: { color?: boolean } = {}
): string[] {
  if (toolsUsed.length === 0) return [];
  const color = options.color ?? useColor();

  const lines = [
    `  ${dim(`tools: ${toolsUsed.join(SEPARATOR)}`, color)}`,
  ];

  const sources: string[] = [];
  for (const tool of toolsUsed) {
    const label = TOOL_SOURCES[tool];
    if (label && !sources.includes(label)) sources.push(label);
  }
  if (sources.length > 0) {
    lines.push(`  ${dim(`sources: ${sources.join(SEPARATOR)}`, color)}`);
  }

  return lines;
}

/**
 * Farewell shown on every exit path, always with the resume command.
 */
export function renderFarewell(
  sessionId: string,
  options: { color?: boolean } = {}
): string[] {
  const color = options.color ?? useColor();
  return [
    "",
    `  ${dim("Session saved. Resume anytime:", color)}`,
    "",
    `    jerry --session ${sessionId}`,
    "",
  ];
}

/**
 * Handle a `/`-prefixed line entirely client-side.
 */
export function runSlashCommand(
  input: string,
  context: ReplContext,
  options: { color?: boolean } = {}
): SlashResult {
  const color = options.color ?? useColor();
  const [rawCommand, ...rest] = input.trim().split(/\s+/);
  const command = rawCommand.toLowerCase();
  const argument = rest.join(" ");

  switch (command) {
    case "/help":
      return {
        kind: "output",
        lines: [
          `  ${dim("/help", color)}      show this list`,
          `  ${dim("/session", color)}   current session ID and resume command`,
          `  ${dim("/new", color)}       start a fresh session (stays in the REPL)`,
          `  ${dim("/runtime", color)}   show the resolved runtime`,
          `  ${dim("/model", color)}     show the resolved model`,
          `  ${dim("/sources", color)}   show which sources of truth are wired up`,
          `  ${dim("/dryrun <task>", color)}  show what would run, without sending`,
          `  ${dim("q \u00b7 exit \u00b7 quit \u00b7 Ctrl+C", color)}  end the session`,
        ],
      };

    case "/session":
      return {
        kind: "output",
        lines: [
          `  ${context.sessionId}`,
          `  ${dim(`resume: jerry --session ${context.sessionId}`, color)}`,
        ],
      };

    case "/new": {
      const sessionId = generateSessionId();
      return {
        kind: "new-session",
        sessionId,
        lines: [
          `  ${dim("new session", color)}  ${sessionId}`,
        ],
      };
    }

    case "/runtime":
      return {
        kind: "output",
        lines: [`  ${dim("runtime", color)}  ${context.profile.runtime}   ${dim("egress", color)}  ${context.profile.egress}`],
      };

    case "/model":
      return {
        kind: "output",
        lines: [`  ${dim("model", color)}  ${context.profile.model}`],
      };

    case "/sources":
      return {
        kind: "output",
        lines: [
          `  ActivityWatch   ${dim("wired up", color)}`,
          `  Local files     ${dim("wired up", color)}`,
          `  Drive           ${dim("work in progress", color)}`,
          `  YouTube         ${dim("work in progress", color)}`,
          `  GitHub          ${dim("work in progress", color)}`,
          `  TimeHuddle      ${dim("planned", color)}`,
        ],
      };

    case "/dryrun": {
      if (!argument) {
        return {
          kind: "output",
          lines: [`  ${dim("usage: /dryrun <task>", color)}`],
        };
      }
      return {
        kind: "output",
        lines: [
          `  ${dim("dry run \u2014 nothing sent", color)}`,
          `  ${dim("task", color)}     ${argument}`,
          `  ${dim("runtime", color)}  ${context.profile.runtime}   ${dim("model", color)}  ${context.profile.model}   ${dim("egress", color)}  ${context.profile.egress}`,
          `  ${dim("session", color)}  ${context.sessionId}`,
          `  ${dim(`candidate tools: ${CANDIDATE_TOOLS.join(SEPARATOR)}`, color)}`,
          `  ${dim("the server picks which of these actually run", color)}`,
        ],
      };
    }

    case "/exit":
    case "/quit":
      return { kind: "exit", lines: [] };

    default:
      return {
        kind: "output",
        lines: [`  ${dim(`unknown command ${command} — try /help`, color)}`],
      };
  }
}

interface Spinner {
  stop(): void;
}

/**
 * Transient "…working…" indicator. Animated on a TTY, a single line otherwise
 * so piped output stays readable.
 */
function startSpinner(color: boolean): Spinner {
  const isTty = process.stdout.isTTY === true;

  if (!isTty) {
    process.stdout.write(`  ${WORKING}\n`);
    return { stop() {} };
  }

  let frame = 0;
  const render = () => {
    const glyph = SPINNER_FRAMES[frame++ % SPINNER_FRAMES.length];
    process.stdout.write(`\r  ${dim(`${glyph} ${WORKING}`, color)}`);
  };
  render();

  const timer = setInterval(render, 90);
  timer.unref?.();

  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      process.stdout.write(`\r${" ".repeat(WORKING.length + 6)}\r`);
    },
  };
}

function writeLines(lines: string[]): void {
  if (lines.length === 0) return;
  process.stdout.write(`${lines.join("\n")}\n`);
}

/**
 * Send one turn and render the reply plus the tools footer. Never throws:
 * errors and suspensions keep the session alive and resumable.
 */
async function runTurn(
  context: ReplContext,
  message: string,
  requestOptions: { profile?: unknown; cwd?: string },
  color: boolean
): Promise<void> {
  const spinner = startSpinner(color);
  const toolsUsed: string[] = [];
  let printedText = false;

  const noteTool = (name: string) => {
    if (name && !toolsUsed.includes(name)) toolsUsed.push(name);
  };

  try {
    for await (const event of streamCall(
      context.url,
      context.sessionId,
      message,
      requestOptions
    )) {
      switch (event.type) {
        case "text":
          spinner.stop();
          writeLines(indent(event.text));
          printedText = true;
          break;

        case "tool-call":
          noteTool(event.toolName);
          break;

        case "finish":
          spinner.stop();
          event.toolsUsed?.forEach(noteTool);
          break;

        case "suspended":
          spinner.stop();
          event.toolsUsed?.forEach(noteTool);
          if (!printedText && event.message) {
            writeLines(indent(event.message));
            printedText = true;
          }
          writeLines([
            `  ${dim(`[${event.reason}] answer above to continue, or leave and resume later`, color)}`,
          ]);
          break;

        case "error":
          spinner.stop();
          writeLines([`  ${dim(`error: ${event.message}`, color)}`]);
          break;

        default:
          break;
      }
    }
  } catch (err) {
    spinner.stop();
    const detail = err instanceof Error ? err.message : String(err);
    writeLines([`  ${dim(`error: ${detail}`, color)}`]);
  } finally {
    spinner.stop();
  }

  writeLines(renderToolsFooter(toolsUsed, { color }));
}

/**
 * Start the interactive session. Resolves when the user leaves.
 */
export async function startRepl(options: ReplOptions = {}): Promise<void> {
  const config = loadConfig();
  const color = useColor();
  const cwdContext = getCwdContext();

  const context: ReplContext = {
    sessionId: options.sessionId ?? generateSessionId(),
    url: config.url,
    profile: describeProfile(config.profile),
  };

  writeLines(renderBanner(context, { resumed: Boolean(options.sessionId), color }));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let turnInFlight = false;
  let exitRequested = false;
  let lastInterruptAt = 0;
  let closed = false;

  rl.once("close", () => {
    closed = true;
  });

  // stdin can reach EOF while a turn is in flight; prompting a closed
  // interface throws.
  const prompt = () => {
    if (!closed) rl.prompt();
  };

  // Ctrl+C arrives either as a readline keypress (raw mode) or as a process
  // signal; dedupe so one press is not counted twice.
  const onInterrupt = () => {
    const now = Date.now();
    if (now - lastInterruptAt < 50) return;
    lastInterruptAt = now;

    if (!turnInFlight) {
      rl.close();
      return;
    }

    if (exitRequested) {
      writeLines(renderFarewell(context.sessionId, { color }));
      process.exit(130);
    }

    exitRequested = true;
    writeLines([
      "",
      `  ${dim("finishing this turn \u2014 press Ctrl+C again to leave now", color)}`,
    ]);
  };

  rl.on("SIGINT", onInterrupt);
  process.on("SIGINT", onInterrupt);

  // The async iterator queues pending lines, so piped input is not dropped
  // while a turn is in flight (rl.question would discard it).
  rl.setPrompt(PROMPT);
  prompt();

  try {
    for await (const rawLine of rl) {
      // A terminal echoes what was typed; piped input does not, so echo it
      // ourselves to keep the transcript readable.
      if (process.stdout.isTTY !== true) process.stdout.write(`${rawLine}\n`);

      const trimmed = rawLine.trim();

      if (trimmed === "") {
        prompt();
        continue;
      }

      if (isExitCommand(trimmed)) break;

      if (trimmed.startsWith("/")) {
        const result = runSlashCommand(trimmed, context, { color });
        writeLines(result.lines);
        if (result.kind === "exit") break;
        if (result.kind === "new-session") context.sessionId = result.sessionId;
        prompt();
        continue;
      }

      turnInFlight = true;
      try {
        await runTurn(
          context,
          trimmed,
          { profile: config.profile, cwd: cwdContext.cwd },
          color
        );
      } finally {
        turnInFlight = false;
      }

      if (exitRequested) break;
      prompt();
    }
  } finally {
    process.removeListener("SIGINT", onInterrupt);
    rl.close();
  }

  writeLines(renderFarewell(context.sessionId, { color }));
}
