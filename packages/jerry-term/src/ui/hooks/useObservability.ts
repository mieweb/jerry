/**
 * Observability hook for tracking tool calls and turn phases.
 * Derives structured state from RuntimeEvents for the UI panels.
 */

import { useState, useCallback, useRef } from "react";
import type { RuntimeEvent } from "@mieweb/jerry-agent-runtime";

export type ToolStatus = "running" | "success" | "error";

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  status: ToolStatus;
  startedAt: number;
  durationMs?: number;
}

export type ThinkingPhase = "idle" | "waiting" | "tools" | "generating";

export interface ObservabilityState {
  tools: Map<string, ToolCall>;
  phase: ThinkingPhase;
  toolsExpanded: boolean;
  thinkingExpanded: boolean;
  outputsExpanded: boolean;
}

export interface UseObservabilityResult {
  state: ObservabilityState;
  dispatch: (event: RuntimeEvent) => void;
  startTurn: () => void;
  endTurn: () => void;
  toggleTools: () => void;
  toggleThinking: () => void;
  toggleOutputs: () => void;
  getToolsArray: () => ToolCall[];
  getCompletedCount: () => number;
  getTotalCount: () => number;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export function getLatencyColor(ms: number): "success" | "warning" | "error" {
  if (ms < 500) return "success";
  if (ms < 2000) return "warning";
  return "error";
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function createInitialState(): ObservabilityState {
  return {
    tools: new Map(),
    phase: "idle",
    toolsExpanded: true,
    thinkingExpanded: true,
    outputsExpanded: false,
  };
}

export function useObservability(): UseObservabilityResult {
  const [state, setState] = useState<ObservabilityState>(createInitialState);
  const sawTextRef = useRef(false);
  const sawToolRef = useRef(false);

  const dispatch = useCallback((event: RuntimeEvent) => {
    setState((prev) => {
      switch (event.type) {
        case "start": {
          return {
            ...prev,
            phase: "waiting",
          };
        }

        case "tool-call": {
          const newTools = new Map(prev.tools);
          newTools.set(event.toolCallId, {
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            input: event.input,
            status: "running",
            startedAt: Date.now(),
          });

          sawToolRef.current = true;
          return {
            ...prev,
            tools: newTools,
            phase: "tools",
          };
        }

        case "tool-result": {
          const newTools = new Map(prev.tools);
          const existing = newTools.get(event.toolCallId);
          if (existing) {
            const now = Date.now();
            newTools.set(event.toolCallId, {
              ...existing,
              output: event.output,
              status: "success",
              durationMs: now - existing.startedAt,
            });
          }

          return {
            ...prev,
            tools: newTools,
          };
        }

        case "text-delta": {
          if (!sawTextRef.current) {
            sawTextRef.current = true;
            return {
              ...prev,
              phase: "generating",
            };
          }
          return prev;
        }

        case "finish": {
          return {
            ...prev,
            phase: "idle",
          };
        }

        case "error": {
          const newTools = new Map(prev.tools);
          for (const [id, tool] of newTools) {
            if (tool.status === "running") {
              newTools.set(id, {
                ...tool,
                status: "error",
                durationMs: Date.now() - tool.startedAt,
              });
            }
          }

          return {
            ...prev,
            tools: newTools,
            phase: "idle",
          };
        }

        default:
          return prev;
      }
    });
  }, []);

  const startTurn = useCallback(() => {
    sawTextRef.current = false;
    sawToolRef.current = false;
    setState((prev) => ({
      ...prev,
      tools: new Map(),
      phase: "waiting",
    }));
  }, []);

  const endTurn = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "idle",
    }));
  }, []);

  const toggleTools = useCallback(() => {
    setState((prev) => ({
      ...prev,
      toolsExpanded: !prev.toolsExpanded,
    }));
  }, []);

  const toggleThinking = useCallback(() => {
    setState((prev) => ({
      ...prev,
      thinkingExpanded: !prev.thinkingExpanded,
    }));
  }, []);

  const toggleOutputs = useCallback(() => {
    setState((prev) => ({
      ...prev,
      outputsExpanded: !prev.outputsExpanded,
    }));
  }, []);

  const getToolsArray = useCallback((): ToolCall[] => {
    return Array.from(state.tools.values());
  }, [state.tools]);

  const getCompletedCount = useCallback((): number => {
    let count = 0;
    for (const tool of state.tools.values()) {
      if (tool.status !== "running") count++;
    }
    return count;
  }, [state.tools]);

  const getTotalCount = useCallback((): number => {
    return state.tools.size;
  }, [state.tools]);

  return {
    state,
    dispatch,
    startTurn,
    endTurn,
    toggleTools,
    toggleThinking,
    toggleOutputs,
    getToolsArray,
    getCompletedCount,
    getTotalCount,
  };
}
