/**
 * TreeView component for rendering nested lines with tree characters.
 */

import React from "react";
import type { ColorPalette } from "../theme/colors.ts";
import { symbols } from "../theme/typography.ts";

export interface TreeItemProps {
  isLast: boolean;
  colors: ColorPalette;
  children: React.ReactNode;
  subItems?: React.ReactNode;
}

export function TreeItem({
  isLast,
  colors,
  children,
  subItems,
}: TreeItemProps): React.ReactNode {
  const prefix = isLast ? symbols.lastBranch : symbols.branch;

  return (
    <box style={{ flexDirection: "column" }}>
      <box style={{ flexDirection: "row", paddingLeft: 1 }}>
        <text style={{ fg: colors.textMuted }}>{prefix} </text>
        {children}
      </box>
      {subItems ? (
        <box style={{ paddingLeft: 4 }}>{subItems}</box>
      ) : null}
    </box>
  );
}

export interface TreeViewProps {
  colors: ColorPalette;
  children: React.ReactNode;
}

export function TreeView({ children }: TreeViewProps): React.ReactNode {
  return <box style={{ flexDirection: "column" }}>{children}</box>;
}
