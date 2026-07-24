/**
 * CommandDropdown component for jerry-term.
 * Shows available commands when user types "/" and allows keyboard navigation.
 * OpenCode-style: overlay above input, Tab/Enter complete (don't execute).
 */

import React from "react";
import type { KeyEvent } from "@opentui/core";
import type { Command } from "../../commands/types.ts";
import type { ColorPalette } from "../theme/colors.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (testable without TUI)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true when input is in slash-command mode (starts with `/`, no whitespace). */
export function isSlashMode(value: string): boolean {
    return /^\/\S*$/.test(value);
}

/** Extracts the filter string after `/` (lowercase). Returns empty string if not in slash mode. */
export function getSlashFilter(value: string): string {
    if (!isSlashMode(value)) return "";
    return value.slice(1).toLowerCase();
}

/** Prefix-filter commands by name or aliases (case-insensitive). */
export function filterCommands(commands: Command[], filter: string): Command[] {
    if (filter === "") return commands;
    const lowerFilter = filter.toLowerCase();
    return commands.filter(
        (cmd) =>
            cmd.name.toLowerCase().startsWith(lowerFilter) ||
            cmd.aliases?.some((alias) =>
                alias.toLowerCase().startsWith(lowerFilter),
            ),
    );
}

/** Clamp index to valid range [0, length - 1], or 0 if empty. */
export function clampIndex(index: number, length: number): number {
    if (length === 0) return 0;
    return Math.max(0, Math.min(index, length - 1));
}

/** Calculate visible window slice for scrolling list. */
export function getVisibleWindow(
    selectedIndex: number,
    totalCount: number,
    maxVisible: number,
): { startIndex: number; endIndex: number } {
    if (totalCount <= maxVisible) {
        return { startIndex: 0, endIndex: totalCount };
    }
    const half = Math.floor(maxVisible / 2);
    let startIndex = selectedIndex - half;
    startIndex = Math.max(0, Math.min(startIndex, totalCount - maxVisible));
    return { startIndex, endIndex: startIndex + maxVisible };
}

/** Returns the completion string `/{name} ` for a command. */
export function getCompletionString(cmd: Command): string {
    return `/${cmd.name} `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export interface UseCommandDropdownResult {
    isOpen: boolean;
    selectedIndex: number;
    filteredCommands: Command[];
    filter: string;
    /** Handle keyboard event. Returns true if consumed (caller should preventDefault). */
    onKey: (event: KeyEvent) => boolean;
    /** Returns `/{name} ` for current selection, or null if nothing selected. */
    complete: () => string | null;
    /** Reset selection to 0. */
    reset: () => void;
}

export function useCommandDropdown(
    allCommands: Command[],
    inputValue: string,
    setInputValue: (value: string) => void,
    onExecute?: (commandStr: string) => void,
): UseCommandDropdownResult {
    const [selectedIndex, setSelectedIndex] = React.useState(0);

    const isOpen = isSlashMode(inputValue);
    const filter = getSlashFilter(inputValue);

    const filteredCommands = React.useMemo(() => {
        if (!isOpen) return [];
        return filterCommands(allCommands, filter);
    }, [allCommands, isOpen, filter]);

    // Reset selection to 0 when filter changes
    const prevFilterRef = React.useRef(filter);
    React.useEffect(() => {
        if (prevFilterRef.current !== filter) {
            setSelectedIndex(0);
            prevFilterRef.current = filter;
        }
    }, [filter]);

    // Clamp if out of bounds (e.g., list shrinks)
    React.useEffect(() => {
        const clamped = clampIndex(selectedIndex, filteredCommands.length);
        if (clamped !== selectedIndex) {
            setSelectedIndex(clamped);
        }
    }, [filteredCommands.length, selectedIndex]);

    const complete = React.useCallback((): string | null => {
        if (!isOpen || filteredCommands.length === 0) return null;
        const cmd =
            filteredCommands[
                clampIndex(selectedIndex, filteredCommands.length)
            ];
        return getCompletionString(cmd);
    }, [isOpen, filteredCommands, selectedIndex]);

    const onKey = React.useCallback(
        (event: KeyEvent): boolean => {
            if (!isOpen) return false;

            const { name, shift } = event;

            // Escape: clear input
            if (name === "escape") {
                setInputValue("");
                setSelectedIndex(0);
                return true;
            }

            // Navigation (only when we have commands)
            if (filteredCommands.length === 0) return false;

            if (name === "up" && !shift) {
                setSelectedIndex((prev) =>
                    prev > 0 ? prev - 1 : filteredCommands.length - 1,
                );
                return true;
            }

            if (name === "down" && !shift) {
                setSelectedIndex((prev) =>
                    prev < filteredCommands.length - 1 ? prev + 1 : 0,
                );
                return true;
            }

            // Tab: complete (insert `/{name} ` into input)
            if (name === "tab") {
                const completion = complete();
                if (completion) {
                    setInputValue(completion);
                    setSelectedIndex(0);
                    return true;
                }
            }

            // Enter: execute the command directly
            if (name === "return") {
                const cmd =
                    filteredCommands[
                        clampIndex(selectedIndex, filteredCommands.length)
                    ];
                if (cmd && onExecute) {
                    setInputValue("");
                    setSelectedIndex(0);
                    onExecute(`/${cmd.name}`);
                    return true;
                }
            }

            return false;
        },
        [
            isOpen,
            filteredCommands,
            complete,
            setInputValue,
            selectedIndex,
            onExecute,
        ],
    );

    const reset = React.useCallback(() => {
        setSelectedIndex(0);
    }, []);

    return {
        isOpen,
        selectedIndex,
        filteredCommands,
        filter,
        onKey,
        complete,
        reset,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Component
// ─────────────────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 8;

export interface CommandDropdownProps {
    commands: Command[];
    selectedIndex: number;
    colors: ColorPalette;
    width: number;
    filter: string;
}

export function CommandDropdown({
    commands,
    selectedIndex,
    colors,
    width,
}: CommandDropdownProps): React.ReactNode {
    if (commands.length === 0) {
        return (
            <box
                width={width}
                height={3}
                border
                borderColor={colors.borderSecondary}
                backgroundColor={colors.bgSecondary}
                paddingLeft={1}
                paddingRight={1}
            >
                <text style={{ fg: colors.textMuted }}>
                    No matching commands
                </text>
            </box>
        );
    }

    const { startIndex, endIndex } = getVisibleWindow(
        selectedIndex,
        commands.length,
        MAX_VISIBLE,
    );
    const visibleCommands = commands.slice(startIndex, endIndex);
    const dropdownHeight = visibleCommands.length + 2;

    // Compute max name width for alignment
    const maxNameWidth = Math.max(
        ...visibleCommands.map((cmd) => cmd.name.length),
    );

    return (
        <box
            width={width}
            height={dropdownHeight}
            border
            borderColor={colors.accent}
            backgroundColor={colors.bgSecondary}
            flexDirection="column"
        >
            {visibleCommands.map((cmd, index) => {
                const actualIndex = startIndex + index;
                const isSelected = actualIndex === selectedIndex;
                const paddedName = `/${cmd.name}`.padEnd(maxNameWidth + 2);
                const descMaxLen = Math.max(10, width - maxNameWidth - 8);
                const desc =
                    cmd.description.length > descMaxLen
                        ? cmd.description.slice(0, descMaxLen - 1) + "…"
                        : cmd.description;

                return (
                    <box
                        key={cmd.name}
                        width="100%"
                        height={1}
                        paddingLeft={1}
                        paddingRight={1}
                        backgroundColor={
                            isSelected ? colors.bgTertiary : colors.bgSecondary
                        }
                        flexDirection="row"
                    >
                        <text
                            style={{
                                fg: isSelected
                                    ? colors.accent
                                    : colors.textPrimary,
                            }}
                        >
                            {paddedName}
                        </text>
                        <text style={{ fg: colors.textMuted }}>{desc}</text>
                    </box>
                );
            })}
        </box>
    );
}
