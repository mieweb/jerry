/**
 * Main App component for jerry-term OpenTUI.
 * Fixed chrome (header / input / status) with a scrollable center transcript.
 */

import React, { useCallback, useEffect, useRef } from "react";
import { useKeyboard } from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { JerryBridge } from "../bridge/index.ts";
import type { TermConfig } from "../config/index.ts";
import type { CommandRegistry } from "../commands/index.ts";
import { getTheme } from "./theme/index.ts";
import { useBridge } from "./hooks/useBridge.ts";
import { useRepl } from "./hooks/useRepl.ts";
import type { TranscriptLine } from "./components/ResponseArea.tsx";

const VERSION = "0.1.0";

export interface AppProps {
  bridge: JerryBridge;
  config: TermConfig;
  registry: CommandRegistry;
  onExit: () => void;
}

function getLineColor(type: TranscriptLine["type"], colors: ReturnType<typeof getTheme>["colors"]): string {
  switch (type) {
    case "user":
      return colors.accent;
    case "assistant":
      return colors.textPrimary;
    case "tool":
      return colors.info;
    case "result":
      return colors.success;
    case "system":
      return colors.textSecondary;
    case "error":
      return colors.error;
  }
}

function getLinePrefix(type: TranscriptLine["type"]): string {
  switch (type) {
    case "user":
      return "> ";
    case "assistant":
      return "";
    case "tool":
      return "[tool] ";
    case "result":
      return "[result] ";
    case "system":
      return "$ ";
    case "error":
      return "Error: ";
  }
}

export function App({ bridge, config, registry, onExit }: AppProps): React.ReactNode {
  const theme = getTheme("dark");
  const scrollboxRef = useRef<ScrollBoxRenderable | null>(null);

  const { state: bridgeState } = useBridge(bridge);
  const {
    inputValue,
    setInputValue,
    transcript,
    streamingContent,
    busy,
    lastLatencyMs,
    toolCount,
    handleSubmit,
    handleHistoryUp,
    handleHistoryDown,
    clearTranscript,
    exitApp,
  } = useRepl(bridge, config, registry, onExit);

  useEffect(() => {
    const box = scrollboxRef.current;
    if (box) {
      box.scrollTo(Infinity);
    }
  }, [transcript.length, streamingContent]);

  useKeyboard((event) => {
    if (event.ctrl && event.name === "c") {
      exitApp();
      return;
    }

    if (busy) return;

    if (event.ctrl && event.name === "l") {
      clearTranscript();
      return;
    }

    if (event.name === "up") {
      handleHistoryUp();
      return;
    }

    if (event.name === "down") {
      handleHistoryDown();
    }
  });

  const onInputSubmit = useCallback(
    (value: string) => {
      void handleSubmit(value);
    },
    [handleSubmit]
  );

  const statusText = busy ? "Processing" : bridgeState.connected ? "Ready" : "Disconnected";
  const statusColor = busy ? theme.colors.info : bridgeState.connected ? theme.colors.success : theme.colors.error;

  return (
    <>
      <box style={{ width: "100%", height: "100%", flexDirection: "column" }}>
        {/* Header - fixed */}
        <box
          style={{
            width: "100%",
            height: 3,
            border: true,
            borderColor: theme.colors.borderPrimary,
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: theme.colors.bgSecondary,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <box style={{ flexDirection: "row" }}>
            <text style={{ fg: bridgeState.connected ? theme.colors.success : theme.colors.error }}>●</text>
            <text style={{ fg: theme.colors.textPrimary }}><b> jerry-term</b></text>
            <text style={{ fg: theme.colors.textSecondary }}> v{VERSION}</text>
          </box>
          <box style={{ flexDirection: "row" }}>
            <text style={{ fg: theme.colors.accent }}>[{bridgeState.runtimeKind}]</text>
            <text style={{ fg: theme.colors.textSecondary }}> {bridgeState.model}</text>
          </box>
        </box>

        {/* Scrollbox transcript - grows to fill */}
        <scrollbox
          ref={scrollboxRef}
          style={{
            flexGrow: 1,
            border: true,
            borderColor: theme.colors.borderPrimary,
            paddingLeft: 1,
            paddingRight: 1,
          }}
          focused={false}
        >
          {transcript.map((line) => (
            <box key={line.id} style={{ width: "100%" }}>
              <text style={{ fg: getLineColor(line.type, theme.colors) }}>
                {getLinePrefix(line.type)}{line.content}
              </text>
            </box>
          ))}
          {streamingContent ? (
            <box style={{ width: "100%" }}>
              <text style={{ fg: theme.colors.textPrimary }}>{streamingContent}</text>
            </box>
          ) : null}
        </scrollbox>

        {/* Input - fixed */}
        <box
          style={{
            width: "100%",
            height: 3,
            border: true,
            borderColor: theme.colors.borderPrimary,
            paddingLeft: 1,
            paddingRight: 1,
            flexDirection: "row",
          }}
        >
          <text style={{ fg: theme.colors.accent }}><b>{">"} </b></text>
          {busy ? (
            <text style={{ fg: theme.colors.textMuted }}>processing...</text>
          ) : (
            <input
              style={{ flexGrow: 1 }}
              value={inputValue}
              onChange={setInputValue}
              onSubmit={onInputSubmit as any}
              focused
            />
          )}
        </box>

        {/* Status bar - fixed */}
        <box
          style={{
            width: "100%",
            height: 3,
            border: true,
            borderColor: theme.colors.borderSecondary,
            paddingLeft: 1,
            paddingRight: 1,
            flexDirection: "row",
          }}
        >
          <text style={{ fg: statusColor }}>●</text>
          <text style={{ fg: theme.colors.textSecondary }}> {statusText}</text>
          <text style={{ fg: theme.colors.textMuted }}> • </text>
          <text style={{ fg: theme.colors.textSecondary }}>
            Last: {lastLatencyMs !== null ? `${(lastLatencyMs / 1000).toFixed(1)}s` : "-"}
          </text>
          <text style={{ fg: theme.colors.textMuted }}> • </text>
          <text style={{ fg: theme.colors.textSecondary }}>Tools: {toolCount}</text>
        </box>
      </box>
    </>
  );
}
