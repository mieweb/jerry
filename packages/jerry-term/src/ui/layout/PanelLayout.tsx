/**
 * Panel layout wrapper stacking Thinking and Tools panels above the main content.
 */

import React from "react";
import type { ColorPalette } from "../theme/colors.ts";
import type { ThinkingPhase, ToolCall } from "../hooks/useObservability.ts";
import { ThinkingPanel } from "../components/ThinkingPanel.tsx";
import { ToolPanel } from "../components/ToolPanel.tsx";

export interface PanelLayoutProps {
  phase: ThinkingPhase;
  tools: ToolCall[];
  thinkingExpanded: boolean;
  toolsExpanded: boolean;
  outputsExpanded: boolean;
  colors: ColorPalette;
  /** Hard height for the center column (panels + transcript). */
  height: number;
  children: React.ReactNode;
}

export function PanelLayout({
  phase,
  tools,
  thinkingExpanded,
  toolsExpanded,
  outputsExpanded,
  colors,
  height,
  children,
}: PanelLayoutProps): React.ReactNode {
  return (
    <box
      width="100%"
      height={height}
      flexShrink={0}
      flexDirection="column"
      overflow="hidden"
      backgroundColor={colors.bgPrimary}
    >
      <ThinkingPanel
        phase={phase}
        expanded={thinkingExpanded}
        colors={colors}
      />
      <ToolPanel
        tools={tools}
        expanded={toolsExpanded}
        outputsExpanded={outputsExpanded}
        colors={colors}
      />
      {children}
    </box>
  );
}
