/**
 * schedule_followup tool — schedule a reminder for future follow-up.
 *
 * Uses the DO alarm mechanism via the host's scheduleWake function.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ToolContext } from "./types.js";

/**
 * Parse a relative time string into a Date.
 */
function parseRelativeTime(relative: string, now: Date = new Date()): Date | null {
  const lower = relative.toLowerCase().trim();

  // Match patterns like "in 2 hours", "in 30 minutes", "in 1 day"
  const inMatch = lower.match(/^in\s+(\d+)\s*(hour|minute|min|day|week)s?$/);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const result = new Date(now);

    switch (unit) {
      case "minute":
      case "min":
        result.setMinutes(result.getMinutes() + amount);
        break;
      case "hour":
        result.setHours(result.getHours() + amount);
        break;
      case "day":
        result.setDate(result.getDate() + amount);
        break;
      case "week":
        result.setDate(result.getDate() + amount * 7);
        break;
    }

    return result;
  }

  // Match "tomorrow at HH:MM" or "tomorrow at H am/pm"
  const tomorrowMatch = lower.match(/^tomorrow\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (tomorrowMatch) {
    let hours = parseInt(tomorrowMatch[1], 10);
    const minutes = tomorrowMatch[2] ? parseInt(tomorrowMatch[2], 10) : 0;
    const ampm = tomorrowMatch[3];

    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;

    const result = new Date(now);
    result.setDate(result.getDate() + 1);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  // Match "at HH:MM" or "at H am/pm" (today)
  const atMatch = lower.match(/^at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (atMatch) {
    let hours = parseInt(atMatch[1], 10);
    const minutes = atMatch[2] ? parseInt(atMatch[2], 10) : 0;
    const ampm = atMatch[3];

    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;

    const result = new Date(now);
    result.setHours(hours, minutes, 0, 0);

    // If the time is in the past, assume tomorrow
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }

    return result;
  }

  // Try to parse as ISO date
  try {
    const parsed = new Date(relative);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch {
    // Ignore parse errors
  }

  return null;
}

/**
 * Create the schedule_followup tool.
 */
export function createScheduleFollowupTool(ctx: ToolContext) {
  return tool({
    description:
      "Schedule a reminder or follow-up for a future time. " +
      "The agent will automatically wake up and resume at the scheduled time. " +
      'Use this when the user asks to be reminded or when you want to check back later. ' +
      'Examples: "in 2 hours", "tomorrow at 9am", "in 30 minutes"',
    parameters: z.object({
      when: z
        .string()
        .describe(
          'When to follow up. Can be relative ("in 2 hours") or absolute ("tomorrow at 9am")'
        ),
      reason: z
        .string()
        .describe("What this follow-up is for — will be included when the agent wakes up"),
    }),
    execute: async ({ when, reason }) => {
      const now = new Date();
      const scheduledTime = parseRelativeTime(when, now);

      if (!scheduledTime) {
        return {
          error: true,
          message: `Could not parse time: "${when}". Try something like "in 2 hours" or "tomorrow at 9am".`,
        };
      }

      if (scheduledTime <= now) {
        return {
          error: true,
          message: `The scheduled time (${scheduledTime.toISOString()}) is in the past.`,
        };
      }

      // Schedule the wake-up via the host's DO alarm
      await ctx.scheduleWake(scheduledTime, {
        reason,
        scheduledAt: now.toISOString(),
        sessionId: ctx.sessionId,
      });

      return {
        error: false,
        scheduledFor: scheduledTime.toISOString(),
        reason,
        message: `Scheduled follow-up for ${scheduledTime.toLocaleString()}: ${reason}`,
      };
    },
  });
}
