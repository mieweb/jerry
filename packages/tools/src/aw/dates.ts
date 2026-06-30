import type { ActivityTimeRange } from "./types.ts";

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const MONTH_PATTERN =
  "january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec";

export const NO_TIME_RANGE_ERROR =
  'No time range in your prompt. Examples: "today", "yesterday", "June 1", "May 10 to May 13", "May 10 to May 13 2026", "last 2 hours", or pass an explicit hours parameter';

type DateParts = { year: number; month: number; day: number };

function parseMonthName(token: string): number | undefined {
  return MONTH_INDEX[token.toLowerCase()];
}

function inferYear(month: number, day: number, now = new Date()): number {
  const y = now.getFullYear();
  const candidate = new Date(y, month, day);
  candidate.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (candidate.getTime() > today.getTime()) {
    return y - 1;
  }
  return y;
}

function resolveYearHint(text: string, month: number, day: number): number {
  const explicit = text.match(/\b(20\d{2})\b/);
  if (explicit) {
    return parseInt(explicit[1], 10);
  }
  if (/\bthis\s+year\b/i.test(text)) {
    return new Date().getFullYear();
  }
  if (/\blast\s+year\b/i.test(text)) {
    return new Date().getFullYear() - 1;
  }
  return inferYear(month, day);
}

function startOfCalendarDay(parts: DateParts): Date {
  const d = new Date(parts.year, parts.month, parts.day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endExclusiveAfterDay(parts: DateParts): Date {
  const d = startOfCalendarDay(parts);
  d.setDate(d.getDate() + 1);
  return d;
}

function formatShortDate(parts: DateParts): string {
  return new Date(parts.year, parts.month, parts.day).toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}

type ParsedCalendarRange = {
  start: Date;
  end: Date;
  label: string;
};

function buildCalendarRange(
  start: DateParts,
  end: DateParts
): ParsedCalendarRange {
  const rangeStart = startOfCalendarDay(start);
  const rangeEnd = endExclusiveAfterDay(end);
  if (rangeEnd.getTime() <= rangeStart.getTime()) {
    throw new Error("Invalid date range: end must be on or after start.");
  }

  const sameDay =
    start.year === end.year &&
    start.month === end.month &&
    start.day === end.day;

  const label = sameDay
    ? `${formatShortDate(start)} (full calendar day, local time)`
    : `${formatShortDate(start)} – ${formatShortDate(end)} (calendar days, local time)`;

  return { start: rangeStart, end: rangeEnd, label };
}

function partsFromMonthDay(
  monthToken: string,
  day: number,
  text: string,
  yearOverride?: number
): DateParts | undefined {
  const month = parseMonthName(monthToken);
  if (month === undefined || day < 1 || day > 31) {
    return undefined;
  }
  const year = yearOverride ?? resolveYearHint(text, month, day);
  const probe = new Date(year, month, day);
  if (probe.getMonth() !== month || probe.getDate() !== day) {
    return undefined;
  }
  return { year, month, day };
}

function parseIsoRange(text: string): ParsedCalendarRange | null {
  const range = text.match(
    /\b(20\d{2})-(\d{2})-(\d{2})\b\s*(?:to|through|until|-)\s*\b(20\d{2})-(\d{2})-(\d{2})\b/i
  );
  if (range) {
    const start: DateParts = {
      year: parseInt(range[1], 10),
      month: parseInt(range[2], 10) - 1,
      day: parseInt(range[3], 10),
    };
    const end: DateParts = {
      year: parseInt(range[4], 10),
      month: parseInt(range[5], 10) - 1,
      day: parseInt(range[6], 10),
    };
    return buildCalendarRange(start, end);
  }

  const single = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (single) {
    const parts: DateParts = {
      year: parseInt(single[1], 10),
      month: parseInt(single[2], 10) - 1,
      day: parseInt(single[3], 10),
    };
    return buildCalendarRange(parts, parts);
  }

  return null;
}

function parseNamedMonthRange(text: string): ParsedCalendarRange | null {
  const range = new RegExp(
    `\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:to|through|until|-)\\s*(?:(${MONTH_PATTERN})\\s+)?(\\d{1,2})(?:st|nd|rd|th)?`,
    "i"
  ).exec(text);

  if (range) {
    const startMonth = range[1];
    const startDay = parseInt(range[2], 10);
    const endMonthToken = range[3] ?? startMonth;
    const endDay = parseInt(range[4], 10);
    const startParts = partsFromMonthDay(startMonth, startDay, text);
    const endParts = partsFromMonthDay(endMonthToken, endDay, text);
    if (startParts && endParts) {
      return buildCalendarRange(startParts, endParts);
    }
  }

  return null;
}

function parseNamedSingleDay(text: string): ParsedCalendarRange | null {
  if (
    /\bto\b|\bthrough\b|\buntil\b/i.test(text) &&
    new RegExp(MONTH_PATTERN, "i").test(text)
  ) {
    return null;
  }

  const monthFirst = new RegExp(
    `\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(20\\d{2}))?`,
    "i"
  ).exec(text);

  if (monthFirst) {
    const yearOverride = monthFirst[3]
      ? parseInt(monthFirst[3], 10)
      : undefined;
    const parts = partsFromMonthDay(
      monthFirst[1],
      parseInt(monthFirst[2], 10),
      text,
      yearOverride
    );
    if (parts) {
      return buildCalendarRange(parts, parts);
    }
  }

  const dayFirst = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_PATTERN})(?:\\s*,?\\s*(20\\d{2}))?`,
    "i"
  ).exec(text);

  if (dayFirst) {
    const yearOverride = dayFirst[3] ? parseInt(dayFirst[3], 10) : undefined;
    const parts = partsFromMonthDay(
      dayFirst[2],
      parseInt(dayFirst[1], 10),
      text,
      yearOverride
    );
    if (parts) {
      return buildCalendarRange(parts, parts);
    }
  }

  return null;
}

export function parseCalendarRangeFromPrompt(
  text: string
): ActivityTimeRange | null {
  return (
    parseIsoRange(text) ?? parseNamedMonthRange(text) ?? parseNamedSingleDay(text)
  );
}
