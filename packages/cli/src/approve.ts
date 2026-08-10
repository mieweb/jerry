/**
 * One-shot ask approval for Drive / YouTube (and other ask-disposition tools).
 *
 * Flow:
 *   1. Send the user message with egress allow-tools
 *   2. If the session parks on waiting_for_approval, immediately send approval
 *      (looping to handle chained ask-disposition tool calls)
 *   3. Print the verified tool result
 *
 * Response text is buffered per turn rather than streamed live: when a turn
 * parks on waiting_for_approval, the buffered text is the noisy "Tool ...
 * requires approval ... Reply to approve" prompt, which is discarded before
 * auto-approving. Only the final turn's text (the actual answer, or a
 * non-approval suspend message) is flushed to stdout.
 */

import {
  parseArgs,
  streamCall,
  type CliConfig,
  type StreamEvent,
} from "@mieweb/cloud-agent-cli";

const APPROVAL_MESSAGE = "approved";

/** Cap on chained auto-approvals per invocation, to avoid a runaway loop. */
const MAX_AUTO_APPROVALS = 5;

export interface ApproveRunResult {
  sessionId: string;
  approved: boolean;
  toolsUsed: string[];
}

/**
 * Strip `--approve` from argv (anywhere). Returns remaining args.
 */
export function extractApproveFlag(args: string[]): {
  approve: boolean;
  rest: string[];
} {
  const rest: string[] = [];
  let approve = false;
  for (const arg of args) {
    if (arg === "--approve") {
      approve = true;
    } else {
      rest.push(arg);
    }
  }
  return { approve, rest };
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function noteTool(toolsUsed: string[], name: string | undefined): void {
  if (name && !toolsUsed.includes(name)) toolsUsed.push(name);
}

export interface ConsumeResult {
  /** Accumulated response text for this turn. Not printed by this function. */
  text: string;
  suspendedReason?: string;
  finishReason?: string;
  hadError: boolean;
}

/**
 * Consume one turn's stream, buffering text instead of printing it.
 * The caller decides whether to flush `text` (e.g. discard it when the turn
 * parks on waiting_for_approval, since that text is just the approval prompt).
 *
 * Exported for unit testing; not part of the package's public API surface.
 */
export async function consumeStream(
  events: AsyncIterable<StreamEvent>,
  options: { debug?: boolean; toolsUsed: string[] }
): Promise<ConsumeResult> {
  let text = "";
  let suspendedReason: string | undefined;
  let finishReason: string | undefined;
  let hadError = false;

  for await (const event of events) {
    if (event.type === "text") {
      text += event.text;
    } else if (event.type === "tool-call") {
      noteTool(options.toolsUsed, event.toolName);
      if (options.debug) {
        console.error(`[tool] ${event.toolName}(${JSON.stringify(event.input)})`);
      }
    } else if (event.type === "tool-result") {
      noteTool(options.toolsUsed, event.toolName);
      if (options.debug) {
        console.error(
          `[tool-result] ${event.toolName}: ${JSON.stringify(event.output)}`
        );
      }
    } else if (event.type === "error") {
      console.error(`\nError: ${event.message}`);
      hadError = true;
    } else if (event.type === "suspended") {
      event.toolsUsed?.forEach((t) => noteTool(options.toolsUsed, t));
      suspendedReason = event.reason;
      if (options.debug) {
        console.error(`\n[suspended] ${event.reason}`);
        if (event.message) {
          console.error(event.message);
        }
      }
    } else if (event.type === "finish") {
      finishReason = event.finishReason;
      event.toolsUsed?.forEach((t) => noteTool(options.toolsUsed, t));
    }
  }

  return { text, suspendedReason, finishReason, hadError };
}

/**
 * Ensure profile egress is allow-tools so ask-disposition tools are available.
 */
export function withAllowToolsProfile(profile: unknown): Record<string, unknown> {
  const base =
    profile && typeof profile === "object"
      ? { ...(profile as Record<string, unknown>) }
      : {};
  return { ...base, egress: "allow-tools" };
}

/**
 * Run a one-shot message that auto-approves waiting_for_approval (Drive/YouTube ask).
 */
export async function runWithApprove(
  config: CliConfig,
  args: string[]
): Promise<ApproveRunResult> {
  const { command, options } = parseArgs(args);

  if (
    command.type !== "call" &&
    command.type !== "debug" &&
    command.type !== "put"
  ) {
    printApproveHelp(config.agent);
    return { sessionId: "", approved: false, toolsUsed: [] };
  }

  if (command.type === "put") {
    console.error("--approve is only supported with --call (default), not -txt/--put");
    process.exitCode = 1;
    return { sessionId: "", approved: false, toolsUsed: [] };
  }

  const message = command.message;
  if (!message.trim()) {
    printApproveHelp(config.agent);
    return { sessionId: "", approved: false, toolsUsed: [] };
  }

  const debug = command.type === "debug" || options.debug === true;
  const baseUrl = config.baseUrl ?? "http://127.0.0.1:8787";
  const sessionId = options.sessionId ?? generateSessionId();
  const profile = withAllowToolsProfile(config.profile);
  const toolsUsed: string[] = [];
  const requestOpts = { profile, cwd: options.cwd ?? process.cwd() };

  if (debug) {
    console.error(`[debug] --approve agent=${config.agent} session=${sessionId}`);
    console.error(`[debug] baseUrl=${baseUrl}`);
    console.error(`[debug] egress=allow-tools`);
  }

  let currentMessage = message;
  let approvals = 0;
  let result: ConsumeResult;

  for (;;) {
    result = await consumeStream(
      streamCall(baseUrl, sessionId, currentMessage, requestOpts),
      { debug, toolsUsed }
    );

    if (result.hadError) {
      process.exitCode = 1;
      console.log();
      console.log(`session: ${sessionId}`);
      if (toolsUsed.length > 0) {
        console.log(`tools: ${toolsUsed.join(" · ")}`);
      }
      return { sessionId, approved: false, toolsUsed };
    }

    if (result.suspendedReason !== "waiting_for_approval") {
      break;
    }

    approvals++;
    if (approvals > MAX_AUTO_APPROVALS) {
      console.error(
        `[approve] exceeded ${MAX_AUTO_APPROVALS} auto-approvals — stopping to avoid a runaway loop`
      );
      console.error(`Resume: jerry --session ${sessionId} <message>`);
      process.exitCode = 1;
      return { sessionId, approved: false, toolsUsed };
    }

    // Discard result.text here: it's just the "Tool ... requires approval"
    // prompt, which is noise once we're about to auto-approve.
    if (debug) {
      console.error(
        `[debug] auto-approving pending tool on session ${sessionId} (${approvals})`
      );
    } else {
      process.stdout.write("[approve] executing pending tool…\n");
    }

    currentMessage = APPROVAL_MESSAGE;
  }

  if (result.text) {
    process.stdout.write(result.text);
  }
  console.log();
  console.log(`session: ${sessionId}`);
  if (toolsUsed.length > 0) {
    console.log(`tools: ${toolsUsed.join(" · ")}`);
  }

  if (result.suspendedReason) {
    console.error(
      `[approve] session suspended for "${result.suspendedReason}" (not waiting_for_approval); not auto-approving`
    );
    console.error(`Resume: jerry --session ${sessionId} <message>`);
    process.exitCode = 1;
    return { sessionId, approved: false, toolsUsed };
  }

  return { sessionId, approved: approvals > 0, toolsUsed };
}

function printApproveHelp(agent: string): void {
  console.log(
    `
${agent} --approve — one-shot ask approval (Drive / YouTube)

Usage:
  ${agent} --approve <message>
  ${agent} --approve --debug <message>
  ${agent} --session <id> --approve <message>

Forces profile egress=allow-tools, sends the message, and if the session
parks on waiting_for_approval, immediately approves and executes the tool.

Examples:
  ${agent} --approve what files did I share today
  ${agent} --approve list my recent google drive files
  ${agent} --approve upload ./demo.mp4 to youtube with title "Test"
  ${agent} --approve get the transcript for youtube video <videoId>

Prerequisites:
  GOOGLE_* + JERRY_OAUTH_ENCRYPTION_KEY in repo .env (worker restarted)
  Browser connect: open /v1/oauth/google/start?userId=local
`.trim()
  );
}
