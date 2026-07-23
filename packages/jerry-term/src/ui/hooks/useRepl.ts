/**
 * Hook for managing REPL state, commands, streaming, and history.
 */

import { useState, useCallback, useRef, useMemo } from "react";
import type { CoreMessage, ToolSet } from "ai";
import type { JerryBridge } from "../../bridge/index.ts";
import type { TermConfig } from "../../config/index.ts";
import { fromWireModel } from "../../config/index.ts";
import type { CommandRegistry, CommandContext, OpenPickerOptions } from "../../commands/index.ts";
import type { TranscriptLine } from "../components/ResponseArea.tsx";
import { createLocalTools } from "../../tools/index.ts";
import type { IOutputWriter } from "../../repl/output.ts";
import { useObservability, type UseObservabilityResult } from "./useObservability.ts";

const COMMAND_REGEX = /^\/(\S+)\s*(.*)/;

export interface UseReplResult {
  inputValue: string;
  setInputValue: (value: string) => void;
  transcript: TranscriptLine[];
  streamingContent: string;
  busy: boolean;
  lastLatencyMs: number | null;
  toolCount: number;
  config: TermConfig;
  setConfig: (config: TermConfig) => void;
  handleSubmit: (value: string) => Promise<void>;
  handleHistoryUp: () => void;
  handleHistoryDown: () => void;
  clearTranscript: () => void;
  exitApp: () => void;
  observability: UseObservabilityResult;
}

let lineIdCounter = 0;
function nextLineId(): string {
  return `line-${++lineIdCounter}`;
}

export function useRepl(
  bridge: JerryBridge,
  config: TermConfig,
  setConfig: (config: TermConfig) => void,
  registry: CommandRegistry,
  onExit: () => void,
  openPicker?: (options: OpenPickerOptions) => void
): UseReplResult {
  const [inputValue, setInputValue] = useState("");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);

  const messagesRef = useRef<CoreMessage[]>([]);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const cancelledRef = useRef(false);

  const tools: ToolSet = useMemo(() => createLocalTools(), []);
  const observability = useObservability();

  const addLine = useCallback(
    (
      type: TranscriptLine["type"],
      content: string,
      meta?: Pick<TranscriptLine, "runtime" | "model">
    ) => {
      setTranscript((prev) => [
        ...prev,
        { id: nextLineId(), type, content, ...meta },
      ]);
    },
    []
  );

  const outputAdapter: IOutputWriter = useMemo(
    () => ({
      write: (text: string) => {
        setTranscript((prev) => {
          if (prev.length === 0) {
            return [{ id: nextLineId(), type: "system", content: text }];
          }
          const last = prev[prev.length - 1];
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + text },
          ];
        });
      },
      writeLine: (text: string) => {
        addLine("system", text);
      },
      streamText: (delta: string) => {
        setStreamingContent((prev) => prev + delta);
      },
      newLine: () => {
        addLine("system", "");
      },
      clear: () => {
        setTranscript([]);
        setStreamingContent("");
      },
    }),
    [addLine]
  );

  const configRef = useRef(config);
  configRef.current = config;

  const handleCommand = useCallback(
    async (name: string, argsStr: string) => {
      const command = registry.get(name);
      if (!command) {
        addLine("error", `Unknown command: /${name}`);
        addLine("system", "Type /help for available commands.");
        return;
      }

      const args = argsStr.trim() ? argsStr.trim().split(/\s+/) : [];
      const ctx: CommandContext = {
        bridge,
        config: configRef.current,
        output: outputAdapter,
        exit: onExit,
        updateConfig: (updates) => {
          setConfig({ ...configRef.current, ...updates });
        },
        openPicker,
      };

      try {
        await command.execute(args, ctx);
      } catch (error) {
        addLine(
          "error",
          error instanceof Error ? error.message : String(error)
        );
      }
    },
    [registry, bridge, setConfig, outputAdapter, onExit, addLine, openPicker]
  );

  const handleChat = useCallback(
    async (
      text: string,
      turnMeta: { runtime: string; model: string }
    ) => {
      messagesRef.current.push({ role: "user", content: text });

      let assistantContent = "";
      let sawToolCall = false;
      let sawError = false;
      const startTime = Date.now();
      cancelledRef.current = false;

      observability.startTurn();

      try {
        for await (const event of bridge.runTurn({
          messages: messagesRef.current,
          tools,
        })) {
          observability.dispatch(event);

          if (cancelledRef.current) {
            addLine("system", "(cancelled)");
            break;
          }

          switch (event.type) {
            case "text-delta":
              setStreamingContent((prev) => prev + event.text);
              assistantContent += event.text;
              break;
            case "tool-call":
              sawToolCall = true;
              if (assistantContent) {
                setStreamingContent("");
                assistantContent = "";
              }
              break;
            case "tool-result":
              break;
            case "finish":
              if (assistantContent) {
                addLine("assistant", assistantContent, turnMeta);
                messagesRef.current.push({
                  role: "assistant",
                  content: assistantContent,
                });
              } else if (!sawToolCall && !sawError) {
                addLine(
                  "error",
                  `No response text from [${turnMeta.runtime}] ${turnMeta.model}. ` +
                    (turnMeta.runtime === "ozwell"
                      ? "This Ozwell model may not support streaming — try gpt-4.1-mini."
                      : "The model finished without producing output.")
                );
              }
              addLine(
                "result",
                `via [${turnMeta.runtime}] ${turnMeta.model}`,
                turnMeta
              );
              setStreamingContent("");
              setLastLatencyMs(Date.now() - startTime);
              break;
            case "error":
              sawError = true;
              addLine("error", event.message);
              break;
          }
        }
      } catch (error) {
        addLine(
          "error",
          error instanceof Error ? error.message : String(error)
        );
      }

      observability.endTurn();
      setStreamingContent("");
    },
    [bridge, tools, addLine, observability]
  );

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      historyRef.current.push(trimmed);
      historyIndexRef.current = historyRef.current.length;
      setInputValue("");

      const commandMatch = trimmed.match(COMMAND_REGEX);
      if (commandMatch) {
        addLine("user", trimmed);
        setBusy(true);
        await handleCommand(commandMatch[1], commandMatch[2]);
      } else {
        const profile = bridge.getProfile();
        const turnMeta = {
          runtime: profile.runtime,
          model: fromWireModel(profile.model),
        };
        addLine("user", trimmed, turnMeta);
        setBusy(true);
        await handleChat(trimmed, turnMeta);
      }

      setBusy(false);
    },
    [addLine, handleCommand, handleChat, bridge]
  );

  const handleHistoryUp = useCallback(() => {
    if (historyRef.current.length === 0) return;
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      setInputValue(historyRef.current[historyIndexRef.current]);
    }
  }, []);

  const handleHistoryDown = useCallback(() => {
    if (historyRef.current.length === 0) return;
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      setInputValue(historyRef.current[historyIndexRef.current]);
    } else {
      historyIndexRef.current = historyRef.current.length;
      setInputValue("");
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    setStreamingContent("");
  }, []);

  const cancelTurn = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const exitApp = useCallback(() => {
    if (busy) {
      cancelTurn();
    } else {
      onExit();
    }
  }, [busy, cancelTurn, onExit]);

  return {
    inputValue,
    setInputValue,
    transcript,
    streamingContent,
    busy,
    lastLatencyMs,
    toolCount: Object.keys(tools).length,
    config,
    setConfig,
    handleSubmit,
    handleHistoryUp,
    handleHistoryDown,
    clearTranscript,
    exitApp,
    observability,
  };
}
