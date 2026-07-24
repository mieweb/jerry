/**
 * Individual tool call display with status glyph, name, latency, and expandable output.
 */

import React from "react";
import type { ColorPalette } from "../theme/colors.ts";
import { symbols } from "../theme/typography.ts";
import type { ToolCall, ToolStatus } from "../hooks/useObservability.ts";
import { truncate, getLatencyColor, formatDuration } from "../hooks/useObservability.ts";

export interface ToolCallItemProps {
  tool: ToolCall;
  isLast: boolean;
  expanded: boolean;
  colors: ColorPalette;
}

function getStatusGlyph(status: ToolStatus): string {
  switch (status) {
    case "running":
      return symbols.hourglass;
    case "success":
      return symbols.checkmark;
    case "error":
      return symbols.cross;
  }
}

function getStatusColor(status: ToolStatus, colors: ColorPalette): string {
  switch (status) {
    case "running":
      return colors.info;
    case "success":
      return colors.success;
    case "error":
      return colors.error;
  }
}

export function ToolCallItem({
  tool,
  isLast,
  expanded,
  colors,
}: ToolCallItemProps): React.ReactNode {
  const prefix = isLast ? symbols.lastBranch : symbols.branch;
  const glyph = getStatusGlyph(tool.status);
  const glyphColor = getStatusColor(tool.status, colors);

  const durationText =
    tool.durationMs !== undefined
      ? formatDuration(tool.durationMs)
      : "...";

  const durationColor =
    tool.durationMs !== undefined
      ? colors[getLatencyColor(tool.durationMs)]
      : colors.textMuted;

  const outputStr =
    tool.output !== undefined
      ? typeof tool.output === "string"
        ? tool.output
        : JSON.stringify(tool.output)
      : null;

  return (
    <box style={{ flexDirection: "column" }}>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text style={{ fg: colors.textMuted }}>{prefix} </text>
        <text style={{ fg: glyphColor }}>{glyph} </text>
        <text style={{ fg: colors.textPrimary }}>
          <b>{tool.toolName}</b>
        </text>
        <text style={{ fg: durationColor }}> ({durationText})</text>
      </box>
      {expanded && outputStr ? (
        <box style={{ paddingLeft: 6 }}>
          <text style={{ fg: colors.textSecondary }}>
            {symbols.continuation} {truncate(outputStr, 200)}
          </text>
        </box>
      ) : null}
    </box>
  );
}
