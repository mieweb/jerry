/**
 * Thinking panel showing inference phase with spinner animation.
 */

import React, { useState, useEffect } from "react";
import type { ColorPalette } from "../theme/colors.ts";
import type { ThinkingPhase } from "../hooks/useObservability.ts";
import { CollapsibleSection } from "./CollapsibleSection.tsx";
import { spinnerFrames } from "../theme/typography.ts";

export interface ThinkingPanelProps {
  phase: ThinkingPhase;
  expanded: boolean;
  colors: ColorPalette;
}

function getPhaseText(phase: ThinkingPhase): string {
  switch (phase) {
    case "idle":
      return "Idle";
    case "waiting":
      return "Waiting for model...";
    case "tools":
      return "Running tools...";
    case "generating":
      return "Generating response...";
  }
}

export function ThinkingPanel({
  phase,
  expanded,
  colors,
}: ThinkingPanelProps): React.ReactNode {
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const isActive = phase !== "idle";

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setSpinnerIndex((prev) => (prev + 1) % spinnerFrames.length);
    }, 80);

    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive) {
    return null;
  }

  const spinner = spinnerFrames[spinnerIndex];
  const phaseText = getPhaseText(phase);

  return (
    <box
      style={{
        width: "100%",
        border: true,
        borderColor: colors.borderPrimary,
        flexShrink: 0,
        maxHeight: expanded ? 5 : 3,
      }}
    >
      <CollapsibleSection
        title="Thinking"
        expanded={expanded}
        shortcut="Ctrl+K"
        icon="🤔"
        colors={colors}
      >
        <box style={{ paddingLeft: 2, flexDirection: "row" }}>
          <text style={{ fg: colors.info }}>{spinner} </text>
          <text style={{ fg: colors.textSecondary }}>{phaseText}</text>
        </box>
      </CollapsibleSection>
    </box>
  );
}
