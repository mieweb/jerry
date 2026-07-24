/**
 * Welcome message module for jerry-term.
 * Displays ASCII art, description, capabilities, and important commands at session start.
 */

import type { TermConfig } from "../config/index.ts";
import type { TranscriptLine } from "../ui/components/index.ts";
import { VERSION } from "../index.ts";

const ASCII_ART = `
    ░█████                                         ░██████████                                    
      ░██                                              ░██                                        
      ░██   ░███████  ░██░████ ░██░████ ░██    ░██     ░██     ░███████  ░██░████ ░█████████████  
      ░██  ░██    ░██ ░███     ░███     ░██    ░██     ░██    ░██    ░██ ░███     ░██   ░██   ░██ 
░██   ░██  ░█████████ ░██      ░██      ░██    ░██     ░██    ░█████████ ░██      ░██   ░██   ░██ 
░██   ░██  ░██        ░██      ░██      ░██   ░███     ░██    ░██        ░██      ░██   ░██   ░██ 
 ░██████    ░███████  ░██      ░██       ░█████░██     ░██     ░███████  ░██      ░██   ░██   ░██ 
                                               ░██                                                
                                         ░███████                                                 
`.trimStart();

const DESCRIPTION = `Jerry is your personal AI assistant that observes your digital activity and helps you stay productive. It integrates with ActivityWatch to understand your work patterns and provides intelligent summaries and insights.`;

const CAPABILITIES = [
  "Summarize your activity from ActivityWatch",
  "Chat with context about your work",
  "Switch between local (Ollama) and cloud runtimes",
];

const COMMANDS = [
  { cmd: "/help", desc: "Show all available commands" },
  { cmd: "/runtime", desc: "Switch runtime or model" },
  { cmd: "/config", desc: "View or update settings" },
  { cmd: "/health", desc: "Check system status" },
  { cmd: "/exit", desc: "Exit jerry-term" },
];

/**
 * Get welcome message as an array of plain text lines (for readline REPL).
 */
export function getWelcomeMessage(config: TermConfig): string[] {
  const lines: string[] = [];

  // ASCII art
  lines.push(...ASCII_ART.split("\n"));
  lines.push("");

  // Version and runtime info
  lines.push(`v${VERSION}  |  Runtime: ${config.runtime}  |  Model: ${config.model}`);
  lines.push("");

  // Description
  lines.push(DESCRIPTION);
  lines.push("");

  // Capabilities
  for (const cap of CAPABILITIES) {
    lines.push(`  • ${cap}`);
  }
  lines.push("");

  // Commands
  lines.push("Commands:");
  for (const { cmd, desc } of COMMANDS) {
    lines.push(`  ${cmd.padEnd(12)} ${desc}`);
  }

  return lines;
}

let welcomeLineIdCounter = 0;
function nextWelcomeLineId(): string {
  return `welcome-${++welcomeLineIdCounter}`;
}

/**
 * Get welcome message as TranscriptLine[] for UI mode.
 */
export function getWelcomeLines(config: TermConfig): TranscriptLine[] {
  const textLines = getWelcomeMessage(config);
  const content = textLines.join("\n");

  return [
    {
      id: nextWelcomeLineId(),
      type: "system",
      content,
    },
  ];
}
