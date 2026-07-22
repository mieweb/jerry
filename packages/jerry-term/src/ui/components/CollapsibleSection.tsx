/**
 * Collapsible section with title, count badge, shortcut hint, and expand/collapse caret.
 */

import React from "react";
import type { ColorPalette } from "../theme/colors.ts";
import { symbols } from "../theme/typography.ts";

export interface CollapsibleSectionProps {
  title: string;
  expanded: boolean;
  shortcut?: string;
  count?: number;
  icon?: string;
  colors: ColorPalette;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  expanded,
  shortcut,
  count,
  icon,
  colors,
  children,
}: CollapsibleSectionProps): React.ReactNode {
  const caret = expanded ? symbols.collapse : symbols.expand;

  return (
    <box style={{ flexDirection: "column", width: "100%" }}>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <box style={{ flexDirection: "row" }}>
          <text style={{ fg: colors.textMuted }}>{caret} </text>
          {icon ? <text>{icon} </text> : null}
          <text style={{ fg: colors.textPrimary }}>
            <b>{title}</b>
          </text>
          {typeof count === "number" ? (
            <text style={{ fg: colors.textSecondary }}> ({count})</text>
          ) : null}
        </box>
        {shortcut ? (
          <text style={{ fg: colors.textMuted }}>[{shortcut}]</text>
        ) : null}
      </box>
      {expanded ? children : null}
    </box>
  );
}
