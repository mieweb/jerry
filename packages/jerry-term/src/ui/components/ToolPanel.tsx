/**
 * Tool execution panel showing active and completed tool calls in tree format.
 */

import React from "react";
import type { ColorPalette } from "../theme/colors.ts";
import type { ToolCall } from "../hooks/useObservability.ts";
import { CollapsibleSection } from "./CollapsibleSection.tsx";
import { ToolCallItem } from "./ToolCallItem.tsx";

export interface ToolPanelProps {
  tools: ToolCall[];
  expanded: boolean;
  outputsExpanded: boolean;
  colors: ColorPalette;
}

export function ToolPanel({
  tools,
  expanded,
  outputsExpanded,
  colors,
}: ToolPanelProps): React.ReactNode {
  if (tools.length === 0) {
    return null;
  }

  return (
    <box
      style={{
        width: "100%",
        border: true,
        borderColor: colors.borderPrimary,
        flexShrink: 0,
        maxHeight: expanded ? 10 : 3,
      }}
    >
      <CollapsibleSection
        title="Tools"
        expanded={expanded}
        shortcut="Ctrl+T"
        count={tools.length}
        icon="🔧"
        colors={colors}
      >
        <box style={{ flexDirection: "column", paddingLeft: 1 }}>
          {tools.map((tool, index) => (
            <ToolCallItem
              key={tool.toolCallId}
              tool={tool}
              isLast={index === tools.length - 1}
              expanded={outputsExpanded}
              colors={colors}
            />
          ))}
        </box>
      </CollapsibleSection>
    </box>
  );
}
