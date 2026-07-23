/**
 * Main App component for jerry-term OpenTUI.
 * Fixed chrome (header / input / status) with a scrollable center transcript.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { JerryBridge } from "../bridge/index.ts";
import type { TermConfig, ByoProviderId } from "../config/index.ts";
import type { CommandRegistry, OpenPickerOptions } from "../commands/index.ts";
import type { RuntimeKind } from "@mieweb/jerry-agent-runtime";
import {
    saveTermConfig,
    setupCredentials,
    switchModel,
    selectRuntime,
    fromWireModel,
    validateCredentials,
} from "../config/index.ts";
import { getTheme } from "./theme/index.ts";
import { useBridge } from "./hooks/useBridge.ts";
import { useRepl } from "./hooks/useRepl.ts";
import type { TranscriptLine } from "./components/ResponseArea.tsx";
import { PanelLayout } from "./layout/PanelLayout.tsx";
import {
    CommandDropdown,
    useCommandDropdown,
} from "./components/CommandDropdown.tsx";
import {
    RuntimePicker,
    useRuntimePicker,
    type PickerNode,
} from "./components/RuntimePicker.tsx";

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

    const [currentConfig, setCurrentConfig] = useState(config);
    const configRef = useRef(currentConfig);
    configRef.current = currentConfig;

    const pickerCallbacks = React.useMemo(
        () => ({
            onSelect: (node: PickerNode) => {
                if (!node.model || !node.runtime) return;

                // Align active runtime/provider with the picked branch first.
                let next = configRef.current;
                if (
                    next.runtime !== node.runtime ||
                    (node.runtime === "byo-cloud" &&
                        next.provider !== node.provider) ||
                    (node.runtime === "anthropic" &&
                        next.provider !== node.provider)
                ) {
                    const selected = selectRuntime(
                        next,
                        node.runtime,
                        node.provider
                    );
                    next = selected.success
                        ? selected.config
                        : {
                              ...next,
                              runtime: node.runtime,
                              provider: node.provider,
                          };
                }

                const result = switchModel(
                    bridge,
                    next,
                    node.model,
                    undefined,
                    saveTermConfig
                );
                setCurrentConfig(result.config);
            },
            onSetupComplete: async (
                runtime: RuntimeKind,
                provider: ByoProviderId | undefined,
                apiKey: string,
                baseURL?: string
            ) => {
                // Validate credentials before saving
                const validation = await validateCredentials(
                    runtime,
                    provider,
                    apiKey,
                    baseURL
                );

                if (!validation.valid) {
                    // Throw error to prevent picker from closing
                    throw new Error(validation.error);
                }

                // Persist credentials only; picker keeps open and drills to models.
                const result = setupCredentials(
                    configRef.current,
                    runtime,
                    provider,
                    { apiKey, baseURL }
                );
                if (result.success) {
                    saveTermConfig(result.config);
                    setCurrentConfig(result.config);
                }
            },
            onCancel: () => {},
        }),
        [bridge]
    );

    const runtimePicker = useRuntimePicker(
        currentConfig,
        pickerCallbacks
    );

    const openPicker = useCallback(
        (options: OpenPickerOptions) => {
            runtimePicker.open({
                mode: options.mode === "setup" ? "setup" : options.mode,
                runtime: options.runtime,
                provider: options.provider,
            });
        },
        [runtimePicker]
    );

    const replState = useRepl(bridge, currentConfig, setCurrentConfig, registry, onExit, openPicker);
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
    } = replState;

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
    // Reserve space for runtime picker when open
    const pickerRows =
        runtimePicker.state.isOpen && !busy
            ? runtimePicker.state.setupMode
                ? runtimePicker.state.provider === "custom"
                    ? 9
                    : 7
                : Math.min(runtimePicker.state.nodes.length, 10) + 4
            : 0;
    const centerHeight = Math.max(
        height - CHROME_ROWS - thinkingRows - toolsRows - dropdownRows - pickerRows,
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

        // Handle runtime picker navigation when open
        if (runtimePicker.state.isOpen) {
            if (runtimePicker.onKey(event)) {
                event.preventDefault();
                return;
            }
        }

        // Handle command dropdown navigation when open (with preventDefault)
        if (commandDropdown.onKey(event)) {
            event.preventDefault();
            return;
        }

        // History navigation when dropdown is not open
        if (!commandDropdown.isOpen && !runtimePicker.state.isOpen) {
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
                            flexDirection="column"
                        >
                            <box flexDirection="row">
                                <text
                                    style={{
                                        fg: getLineColor(
                                            line.type,
                                            theme.colors
                                        ),
                                    }}
                                >
                                    {getLinePrefix(line.type)}
                                    {line.content}
                                </text>
                            </box>
                            {line.type === "user" && line.model ? (
                                <text style={{ fg: theme.colors.textMuted }}>
                                    {"  → "}[{line.runtime}] {line.model}
                                </text>
                            ) : null}
                        </box>
                    ))}
                    {streamingContent ? (
                        <box width="100%" flexDirection="column">
                            <text style={{ fg: theme.colors.textPrimary }}>
                                {streamingContent}
                            </text>
                            <text style={{ fg: theme.colors.textMuted }}>
                                {"  → "}[{bridgeState.runtimeKind}]{" "}
                                {fromWireModel(bridgeState.model)}
                            </text>
                        </box>
                    ) : null}
                </scrollbox>
            </PanelLayout>

            {/* Command Dropdown - appears above input when typing "/" */}
            {commandDropdown.isOpen && !busy && !runtimePicker.state.isOpen && (
                <CommandDropdown
                    key={`dropdown-${commandDropdown.filter}`}
                    commands={commandDropdown.filteredCommands}
                    selectedIndex={commandDropdown.selectedIndex}
                    colors={theme.colors}
                    width={width - 2}
                    filter={commandDropdown.filter}
                />
            )}

            {/* Runtime Picker - appears when /runtime or /model opens it */}
            {runtimePicker.state.isOpen && !busy && (
                <RuntimePicker
                    state={runtimePicker.state}
                    colors={theme.colors}
                    width={width - 2}
                    onApiKeyInput={runtimePicker.setSetupApiKey}
                    onBaseURLInput={runtimePicker.setSetupBaseURL}
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
