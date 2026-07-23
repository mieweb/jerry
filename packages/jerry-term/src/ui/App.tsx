/**
 * Main App component for jerry-term OpenTUI.
 * Fixed chrome (header / input / status) with a scrollable center transcript.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { JerryBridge } from "../bridge/index.ts";
import type { TermConfig } from "../config/index.ts";
import type { CommandRegistry } from "../commands/index.ts";
import { getTheme } from "./theme/index.ts";
import { useBridge } from "./hooks/useBridge.ts";
import { useRepl } from "./hooks/useRepl.ts";
import type { TranscriptLine } from "./components/ResponseArea.tsx";
import { PanelLayout } from "./layout/PanelLayout.tsx";
import {
    CommandDropdown,
    useCommandDropdown,
} from "./components/CommandDropdown.tsx";

const VERSION = "0.1.0";

/** Fixed chrome rows: header + input + status (each height 3 including border). */
const CHROME_ROWS = 9;

export interface AppProps {
    bridge: JerryBridge;
    config: TermConfig;
    registry: CommandRegistry;
    onExit: () => void;
}

function getLineColor(
    type: TranscriptLine["type"],
    colors: ReturnType<typeof getTheme>["colors"],
): string {
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

export function App({
    bridge,
    config,
    registry,
    onExit,
}: AppProps): React.ReactNode {
    const theme = getTheme("dark");
    const { width, height } = useTerminalDimensions();
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
        observability,
    } = useRepl(bridge, config, registry, onExit);

    const allCommands = registry.getAll();
    const commandDropdown = useCommandDropdown(
        allCommands,
        inputValue,
        setInputValue,
        (cmd) => void handleSubmit(cmd),
    );

    // Force re-render when dropdown visibility changes (workaround for OpenTUI rendering)
    const [, forceRender] = useState(0);
    useEffect(() => {
        forceRender((n) => n + 1);
    }, [commandDropdown.isOpen]);

    const obsTools = observability.getToolsArray();
    const obsCompletedCount = observability.getCompletedCount();
    const obsTotalCount = observability.getTotalCount();

    // Reserve space for optional tool/thinking panels so the scrollbox stays bounded.
    const thinkingRows =
        observability.state.phase !== "idle"
            ? observability.state.thinkingExpanded
                ? 5
                : 3
            : 0;
    const toolsRows =
        obsTools.length > 0
            ? observability.state.toolsExpanded
                ? Math.min(10, 3 + obsTools.length)
                : 3
            : 0;
    // Reserve space for dropdown when open
    const dropdownRows =
        commandDropdown.isOpen && !busy
            ? commandDropdown.filteredCommands.length > 0
                ? Math.min(commandDropdown.filteredCommands.length, 8) + 2
                : 3
            : 0;
    const centerHeight = Math.max(
        height - CHROME_ROWS - thinkingRows - toolsRows - dropdownRows,
        5,
    );

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

        if (event.ctrl && event.name === "t") {
            observability.toggleTools();
            return;
        }

        if (event.ctrl && event.name === "k") {
            observability.toggleThinking();
            return;
        }

        if (event.ctrl && event.name === "e") {
            observability.toggleOutputs();
            return;
        }

        // Scroll transcript without stealing focus from the input.
        if (event.name === "pageup") {
            scrollboxRef.current?.scrollBy(-1, "viewport");
            return;
        }
        if (event.name === "pagedown") {
            scrollboxRef.current?.scrollBy(1, "viewport");
            return;
        }
        if (event.shift && event.name === "up") {
            scrollboxRef.current?.scrollBy(-3);
            return;
        }
        if (event.shift && event.name === "down") {
            scrollboxRef.current?.scrollBy(3);
            return;
        }

        if (busy) return;

        if (event.ctrl && event.name === "l") {
            clearTranscript();
            return;
        }

        // Handle command dropdown navigation when open (with preventDefault)
        if (commandDropdown.onKey(event)) {
            event.preventDefault();
            return;
        }

        // History navigation when dropdown is not open
        if (!commandDropdown.isOpen) {
            if (event.name === "up") {
                event.preventDefault();
                handleHistoryUp();
                return;
            }

            if (event.name === "down") {
                event.preventDefault();
                handleHistoryDown();
                return;
            }
        }
    });

    const onInputSubmit = useCallback(
        (value: string) => {
            // Dropdown handles its own Enter via onKey (completes, doesn't submit).
            // This fires only when dropdown is closed or after completion.
            commandDropdown.reset();
            void handleSubmit(value);
        },
        [handleSubmit, commandDropdown],
    );

    const statusText = busy
        ? "Processing"
        : bridgeState.connected
          ? "Ready"
          : "Disconnected";
    const statusColor = busy
        ? theme.colors.info
        : bridgeState.connected
          ? theme.colors.success
          : theme.colors.error;

    return (
        <box
            width={width}
            height={height}
            flexDirection="column"
            backgroundColor={theme.colors.bgPrimary}
            overflow="hidden"
        >
            {/* Header - fixed */}
            <box
                width="100%"
                height={3}
                flexShrink={0}
                border
                borderColor={theme.colors.borderPrimary}
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={theme.colors.bgSecondary}
                flexDirection="row"
                justifyContent="space-between"
            >
                <box flexDirection="row">
                    <text
                        style={{
                            fg: bridgeState.connected
                                ? theme.colors.success
                                : theme.colors.error,
                        }}
                    >
                        ●
                    </text>
                    <text style={{ fg: theme.colors.textPrimary }}>
                        <b> jerry-term</b>
                    </text>
                    <text style={{ fg: theme.colors.textSecondary }}>
                        {" "}
                        v{VERSION}
                    </text>
                </box>
                <box flexDirection="row">
                    <text style={{ fg: theme.colors.accent }}>
                        [{bridgeState.runtimeKind}]
                    </text>
                    <text style={{ fg: theme.colors.textSecondary }}>
                        {" "}
                        {bridgeState.model}
                    </text>
                </box>
            </box>

            {/* Observability panels + transcript */}
            <PanelLayout
                phase={observability.state.phase}
                tools={obsTools}
                thinkingExpanded={observability.state.thinkingExpanded}
                toolsExpanded={observability.state.toolsExpanded}
                outputsExpanded={observability.state.outputsExpanded}
                colors={theme.colors}
                height={centerHeight + thinkingRows + toolsRows}
            >
                <scrollbox
                    ref={scrollboxRef}
                    flexGrow={1}
                    flexShrink={1}
                    minHeight={0}
                    height={centerHeight}
                    border
                    borderColor={theme.colors.borderPrimary}
                    paddingLeft={1}
                    paddingRight={1}
                    stickyScroll
                    stickyStart="bottom"
                    scrollY
                    focused={false}
                    rootOptions={{ backgroundColor: theme.colors.bgPrimary }}
                    viewportOptions={{
                        backgroundColor: theme.colors.bgPrimary,
                    }}
                    contentOptions={{ backgroundColor: theme.colors.bgPrimary }}
                    scrollbarOptions={{
                        trackOptions: {
                            foregroundColor: theme.colors.accent,
                            backgroundColor: theme.colors.bgTertiary,
                        },
                    }}
                >
                    {transcript.map((line, index) => (
                        <box
                            key={line.id}
                            width="100%"
                            marginTop={
                                line.type === "user" && index > 0 ? 1 : 0
                            }
                        >
                            <text
                                style={{
                                    fg: getLineColor(line.type, theme.colors),
                                }}
                            >
                                {getLinePrefix(line.type)}
                                {line.content}
                            </text>
                        </box>
                    ))}
                    {streamingContent ? (
                        <box width="100%">
                            <text style={{ fg: theme.colors.textPrimary }}>
                                {streamingContent}
                            </text>
                        </box>
                    ) : null}
                </scrollbox>
            </PanelLayout>

            {/* Command Dropdown - appears above input when typing "/" */}
            {commandDropdown.isOpen && !busy && (
                <CommandDropdown
                    key={`dropdown-${commandDropdown.filter}`}
                    commands={commandDropdown.filteredCommands}
                    selectedIndex={commandDropdown.selectedIndex}
                    colors={theme.colors}
                    width={width - 2}
                    filter={commandDropdown.filter}
                />
            )}

            {/* Input - fixed */}
            <box
                width="100%"
                height={3}
                flexShrink={0}
                border
                borderColor={
                    commandDropdown.isOpen
                        ? theme.colors.accent
                        : theme.colors.borderPrimary
                }
                paddingLeft={1}
                paddingRight={1}
                flexDirection="row"
                backgroundColor={theme.colors.bgPrimary}
            >
                <text style={{ fg: theme.colors.accent }}>
                    <b>{">"} </b>
                </text>
                {busy ? (
                    <text style={{ fg: theme.colors.textMuted }}>
                        processing...
                    </text>
                ) : (
                    <input
                        focused
                        value={inputValue}
                        onInput={setInputValue}
                        onSubmit={onInputSubmit as any}
                        style={{ flexGrow: 1 }}
                    />
                )}
            </box>

            {/* Status bar - fixed */}
            <box
                width="100%"
                height={3}
                flexShrink={0}
                border
                borderColor={theme.colors.borderSecondary}
                paddingLeft={1}
                paddingRight={1}
                flexDirection="row"
                backgroundColor={theme.colors.bgSecondary}
            >
                <text style={{ fg: statusColor }}>●</text>
                <text style={{ fg: theme.colors.textSecondary }}>
                    {" "}
                    {statusText}
                </text>
                <text style={{ fg: theme.colors.textMuted }}> • </text>
                <text style={{ fg: theme.colors.textSecondary }}>
                    Last:{" "}
                    {lastLatencyMs !== null
                        ? `${(lastLatencyMs / 1000).toFixed(1)}s`
                        : "-"}
                </text>
                <text style={{ fg: theme.colors.textMuted }}> • </text>
                <text style={{ fg: theme.colors.textSecondary }}>
                    Tools:{" "}
                    {obsTotalCount > 0
                        ? `${obsCompletedCount}/${obsTotalCount}`
                        : toolCount}
                </text>
                <text style={{ fg: theme.colors.textMuted }}> • </text>
                <text style={{ fg: theme.colors.textMuted }}>
                    PgUp/PgDn scroll
                </text>
            </box>
        </box>
    );
}
