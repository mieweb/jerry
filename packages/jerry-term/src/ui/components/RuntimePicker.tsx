/**
 * RuntimePicker component for jerry-term.
 * Interactive tree picker for runtime/provider/model selection.
 * Supports setup flow for entering API keys.
 */

import React from "react";
import type { KeyEvent } from "@opentui/core";
import type { RuntimeKind } from "@mieweb/jerry-agent-runtime";
import type { ColorPalette } from "../theme/colors.ts";
import type { TermConfig, ByoProviderId } from "../../config/index.ts";
import {
  getByoProviders,
  getProviderForRuntime,
  hasCredentials,
  fromWireModel,
  listOzwellModels,
  partitionOzwellModels,
  listOpenAIModels,
  listAnthropicModels,
  maskApiKey,
} from "../../config/index.ts";
import { listOllamaModels } from "../../health/index.ts";

export const OZWELL_OTHER_TOGGLE_ID = "ozwell-other-toggle";

function resolveOzwellApiKey(config: TermConfig): string | undefined {
  return (
    process.env.OZWELL_API_KEY ??
    process.env.OZWELL_AGENT_KEY ??
    process.env.JERRY_API_KEY ??
    config.credentials?.ozwell?.apiKey ??
    (config.runtime === "ozwell" ? config.apiKey : undefined)
  );
}

function resolveOzwellEndpoint(config: TermConfig): string {
  return (
    process.env.JERRY_ENDPOINT ??
    process.env.OZWELL_ENDPOINT ??
    config.credentials?.ozwell?.endpoint ??
    (config.runtime === "ozwell" ? config.endpoint : undefined) ??
    getProviderForRuntime("ozwell")?.baseURL ??
    "https://ozwellapi.os.mieweb.org"
  );
}

function resolveOpenAIApiKey(config: TermConfig): string | undefined {
  return (
    process.env.OPENAI_API_KEY ??
    process.env.JERRY_API_KEY ??
    config.credentials?.byo?.openai?.apiKey ??
    (config.runtime === "byo-cloud" && config.provider === "openai"
      ? config.apiKey
      : undefined)
  );
}

function resolveAnthropicApiKey(config: TermConfig): string | undefined {
  return (
    process.env.ANTHROPIC_API_KEY ??
    config.credentials?.byo?.anthropic?.apiKey ??
    (config.runtime === "anthropic" ? config.apiKey : undefined)
  );
}

function runtimeNodesFromState(
  config: TermConfig,
  prev: Pick<
    PickerState,
    | "ollamaModels"
    | "ollamaError"
    | "ozwellModels"
    | "ozwellError"
    | "ozwellUsedFallback"
  >
): PickerNode[] {
  return buildRuntimeNodes(
    config,
    prev.ollamaModels,
    prev.ollamaError,
    prev.ozwellModels,
    { error: prev.ozwellError, usedFallback: prev.ozwellUsedFallback }
  );
}

export type PickerLevel = "runtime" | "provider" | "model" | "setup";

export interface PickerNode {
  id: string;
  label: string;
  description?: string;
  level: PickerLevel;
  runtime?: RuntimeKind;
  provider?: ByoProviderId;
  model?: string;
  needsSetup?: boolean;
  docsURL?: string;
  children?: PickerNode[];
  /** Expand/collapse row (e.g. Ozwell "Other models") */
  isToggle?: boolean;
  /** Non-selectable placeholder node */
  isPlaceholder?: boolean;
  /** Remove API key action */
  isRemoveKey?: boolean;
}

export interface PickerState {
  isOpen: boolean;
  level: PickerLevel;
  runtime?: RuntimeKind;
  provider?: ByoProviderId;
  selectedIndex: number;
  nodes: PickerNode[];
  setupMode: boolean;
  setupApiKey: string;
  setupBaseURL: string;
  /** True while fetching remote model lists */
  loading?: boolean;
  /** Last Ollama fetch error (if any) */
  ollamaError?: string;
  /** Cached live Ollama model names */
  ollamaModels?: string[];
  /** Cached Ozwell model names (live or curated fallback) */
  ozwellModels?: string[];
  /** Last Ozwell fetch error (if any) */
  ozwellError?: string;
  /** True when Ozwell list came from curated fallback */
  ozwellUsedFallback?: boolean;
  /** Whether the Ozwell "Other models" group is expanded */
  ozwellOtherExpanded?: boolean;
  /** Cached OpenAI model names */
  openaiModels?: string[];
  /** Last OpenAI fetch error (if any) */
  openaiError?: string;
  /** Cached Anthropic model info */
  anthropicModels?: Array<{ id: string; displayName?: string }>;
  /** Last Anthropic fetch error (if any) */
  anthropicError?: string;
}

export function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

export function getVisibleWindow(
  selectedIndex: number,
  totalCount: number,
  maxVisible: number
): { startIndex: number; endIndex: number } {
  if (totalCount <= maxVisible) {
    return { startIndex: 0, endIndex: totalCount };
  }
  const half = Math.floor(maxVisible / 2);
  let startIndex = selectedIndex - half;
  startIndex = Math.max(0, Math.min(startIndex, totalCount - maxVisible));
  return { startIndex, endIndex: startIndex + maxVisible };
}

export function buildRuntimeNodes(
  config: TermConfig,
  ollamaModels?: string[],
  ollamaError?: string,
  ozwellModels?: string[],
  ozwellMeta?: { error?: string; usedFallback?: boolean }
): PickerNode[] {
  const runtimes: RuntimeKind[] = ["local", "ozwell", "byo-cloud"];

  return runtimes.map((rt) => {
    const provider = getProviderForRuntime(rt, undefined);
    const hasCreds = hasCredentials(config, rt, undefined);
    // Anthropic lives under BYO in the picker even though its RuntimeKind is separate.
    const isCurrent =
      config.runtime === rt ||
      (rt === "byo-cloud" && config.runtime === "anthropic");

    let description = "";
    if (rt === "local") {
      if (ollamaError) {
        description = isCurrent
          ? `(current: ${fromWireModel(config.model)}) · Ollama unavailable`
          : "Ollama unavailable";
      } else if (ollamaModels) {
        const countLabel =
          ollamaModels.length > 0
            ? `${ollamaModels.length} model${ollamaModels.length !== 1 ? "s" : ""} available`
            : "no models installed";
        description = isCurrent
          ? `(current: ${fromWireModel(config.model)}) · ${countLabel}`
          : countLabel;
      } else {
        description = isCurrent
          ? `(current: ${fromWireModel(config.model)})`
          : "Ollama local models";
      }
    } else if (rt === "ozwell") {
      if (!hasCreds) {
        description = isCurrent
          ? `(current: ${fromWireModel(config.model)}) · needs setup`
          : "needs setup";
      } else if (ozwellModels) {
        const source = ozwellMeta?.usedFallback ? "curated" : "live";
        const countLabel = `${ozwellModels.length} model${ozwellModels.length !== 1 ? "s" : ""} (${source})`;
        description = isCurrent
          ? `(current: ${fromWireModel(config.model)}) · ${countLabel}`
          : countLabel;
      } else {
        description = isCurrent
          ? `(current: ${fromWireModel(config.model)})`
          : "ready";
      }
    } else if (rt === "byo-cloud") {
      // Setup is per-provider — never gate the BYO runtime row itself.
      const byoProviders = getByoProviders();
      const readyCount = byoProviders.filter((p) =>
        hasCredentials(config, p.runtime, p.byoProvider)
      ).length;
      if (isCurrent) {
        description = `(current: ${fromWireModel(config.model)})`;
      } else if (readyCount > 0) {
        description = `${readyCount} provider${readyCount !== 1 ? "s" : ""} ready`;
      } else {
        description = "OpenAI, Anthropic…";
      }
    } else if (isCurrent) {
      description = `(current: ${fromWireModel(config.model)})`;
    } else if (!hasCreds) {
      description = "needs setup";
    } else {
      description = "ready";
    }

    return {
      id: rt,
      label: rt === "byo-cloud" ? "BYO Cloud" : (provider?.name ?? rt),
      description,
      level: "runtime" as PickerLevel,
      runtime: rt,
      // byo-cloud always drills into the provider list; setup is per-provider.
      needsSetup: rt !== "local" && rt !== "byo-cloud" && !hasCreds,
      docsURL: rt === "byo-cloud" ? undefined : provider?.docsURL,
    };
  });
}

export function buildProviderNodes(config: TermConfig): PickerNode[] {
  const byoProviders = getByoProviders();

  const nodes: PickerNode[] = byoProviders.map((p) => {
    const actualRuntime = p.runtime;
    const hasCreds = hasCredentials(config, actualRuntime, p.byoProvider);
    const isCurrent =
      (config.runtime === actualRuntime && config.provider === p.byoProvider) ||
      (config.runtime === "byo-cloud" && config.provider === p.byoProvider);

    const savedKey = config.credentials?.byo?.[p.byoProvider!]?.apiKey;

    let description = "";
    if (isCurrent) {
      description = `(current: ${fromWireModel(config.model)})`;
    } else if (!hasCreds) {
      description = "needs setup";
    } else if (savedKey) {
      description = maskApiKey(savedKey);
    } else {
      description = "ready";
    }

    return {
      id: p.id,
      label: p.name,
      description,
      level: "provider" as PickerLevel,
      runtime: actualRuntime,
      provider: p.byoProvider,
      needsSetup: !hasCreds,
      docsURL: p.docsURL,
    };
  });

  nodes.push({
    id: "more-coming-soon",
    label: "── More coming soon ──",
    description: "",
    level: "provider" as PickerLevel,
    isPlaceholder: true,
  });

  return nodes;
}

export interface BuildModelNodesOptions {
  loading?: boolean;
  ollamaError?: string;
  ozwellModels?: string[];
  ozwellError?: string;
  ozwellUsedFallback?: boolean;
  ozwellOtherExpanded?: boolean;
  openaiModels?: string[];
  openaiError?: string;
  anthropicModels?: Array<{ id: string; displayName?: string }>;
  anthropicError?: string;
}

function buildOzwellModelNodes(
  runtime: RuntimeKind,
  currentModelId: string,
  models: string[],
  options?: BuildModelNodesOptions
): PickerNode[] {
  const { recommended, other } = partitionOzwellModels(models, currentModelId);
  const sourceNote = options?.ozwellUsedFallback
    ? options.ozwellError
      ? `curated · ${options.ozwellError}`
      : "curated"
    : "live";
  const expanded = options?.ozwellOtherExpanded ?? false;

  const nodes: PickerNode[] = recommended.map((m) => ({
    id: m.id,
    label: m.name,
    description:
      m.id === currentModelId
        ? `(current) · ${m.description ?? sourceNote}`
        : (m.description ?? sourceNote),
    level: "model" as PickerLevel,
    runtime,
    model: m.id,
  }));

  if (other.length > 0) {
    nodes.push({
      id: OZWELL_OTHER_TOGGLE_ID,
      label: expanded
        ? `▼ Other models (${other.length})`
        : `▶ Other models (${other.length})`,
      description: expanded ? "Enter to collapse" : "Enter to expand",
      level: "model" as PickerLevel,
      runtime,
      isToggle: true,
    });

    if (expanded) {
      for (const id of other) {
        nodes.push({
          id,
          label: id,
          description:
            id === currentModelId ? `(current) · ${sourceNote}` : sourceNote,
          level: "model" as PickerLevel,
          runtime,
          model: id,
        });
      }
    }
  }

  return nodes;
}

export function buildModelNodes(
  config: TermConfig,
  runtime: RuntimeKind,
  provider?: ByoProviderId,
  ollamaModels?: string[],
  options?: BuildModelNodesOptions
): PickerNode[] {
  const providerDef = getProviderForRuntime(runtime, provider);
  const currentModelId = fromWireModel(config.model);

  if (runtime === "local") {
    if (options?.loading) {
      return [
        {
          id: "ollama-loading",
          label: "Loading Ollama models…",
          description: "GET /api/tags",
          level: "model" as PickerLevel,
          runtime,
        },
      ];
    }

    if (options?.ollamaError) {
      return [
        {
          id: "ollama-error",
          label: "Ollama not available",
          description: options.ollamaError,
          level: "model" as PickerLevel,
          runtime,
        },
      ];
    }

    if (ollamaModels && ollamaModels.length === 0) {
      return [
        {
          id: "ollama-empty",
          label: "No Ollama models installed",
          description: "Run: ollama pull llama3.1:8b",
          level: "model" as PickerLevel,
          runtime,
        },
      ];
    }

    if (ollamaModels?.length) {
      return ollamaModels.map((m) => ({
        id: m,
        label: m,
        description: m === currentModelId ? "(current)" : undefined,
        level: "model" as PickerLevel,
        runtime,
        model: m,
      }));
    }

    return [
      {
        id: "ollama-loading",
        label: "Loading Ollama models…",
        description: "GET /api/tags",
        level: "model" as PickerLevel,
        runtime,
      },
    ];
  }

  if (runtime === "ozwell") {
    if (options?.loading) {
      return [
        {
          id: "ozwell-loading",
          label: "Loading Ozwell models…",
          description: "GET /v1/models",
          level: "model" as PickerLevel,
          runtime,
        },
      ];
    }

    const liveOrFallback = options?.ozwellModels;
    if (liveOrFallback?.length) {
      return buildOzwellModelNodes(runtime, currentModelId, liveOrFallback, options);
    }

    if (providerDef?.models.length) {
      return buildOzwellModelNodes(
        runtime,
        currentModelId,
        providerDef.models.map((m) => m.id),
        { ...options, ozwellUsedFallback: true }
      );
    }
  }

  if (runtime === "byo-cloud" && provider === "openai") {
    if (options?.loading) {
      return [
        {
          id: "openai-loading",
          label: "Loading OpenAI models…",
          description: "GET /v1/models",
          level: "model" as PickerLevel,
          runtime,
          provider,
        },
      ];
    }

    if (options?.openaiError) {
      return [
        {
          id: "openai-error",
          label: options.openaiError === "Invalid API key" ? "Invalid API key" : "Service unavailable",
          description: options.openaiError,
          level: "model" as PickerLevel,
          runtime,
          provider,
        },
      ];
    }

    if (options?.openaiModels?.length) {
      return options.openaiModels.map((m) => ({
        id: m,
        label: m,
        description: m === currentModelId ? "(current)" : undefined,
        level: "model" as PickerLevel,
        runtime,
        provider,
        model: m,
      }));
    }

    return [
      {
        id: "openai-loading",
        label: "Loading OpenAI models…",
        description: "GET /v1/models",
        level: "model" as PickerLevel,
        runtime,
        provider,
      },
    ];
  }

  if (runtime === "anthropic") {
    if (options?.loading) {
      return [
        {
          id: "anthropic-loading",
          label: "Loading Anthropic models…",
          description: "GET /v1/models",
          level: "model" as PickerLevel,
          runtime,
          provider,
        },
      ];
    }

    if (options?.anthropicError) {
      return [
        {
          id: "anthropic-error",
          label: options.anthropicError === "Invalid API key" ? "Invalid API key" : "Service unavailable",
          description: options.anthropicError,
          level: "model" as PickerLevel,
          runtime,
          provider,
        },
      ];
    }

    if (options?.anthropicModels?.length) {
      return options.anthropicModels.map((m) => ({
        id: m.id,
        label: m.displayName ?? m.id,
        description: m.id === currentModelId ? "(current)" : undefined,
        level: "model" as PickerLevel,
        runtime,
        provider,
        model: m.id,
      }));
    }

    return [
      {
        id: "anthropic-loading",
        label: "Loading Anthropic models…",
        description: "GET /v1/models",
        level: "model" as PickerLevel,
        runtime,
        provider,
      },
    ];
  }

  if (providerDef?.models.length) {
    return providerDef.models.map((m) => ({
      id: m.id,
      label: m.name,
      description:
        m.id === currentModelId
          ? `(current) ${m.description ?? ""}`
          : m.description,
      level: "model" as PickerLevel,
      runtime,
      provider,
      model: m.id,
    }));
  }

  return [
    {
      id: "custom-input",
      label: "Enter model ID manually...",
      level: "model" as PickerLevel,
      runtime,
      provider,
    },
  ];
}

export interface UseRuntimePickerResult {
  state: PickerState;
  open: (options?: {
    mode?: PickerLevel;
    runtime?: RuntimeKind;
    provider?: ByoProviderId;
  }) => void;
  close: () => void;
  onKey: (event: KeyEvent) => boolean;
  setSetupApiKey: (key: string) => void;
  setSetupBaseURL: (url: string) => void;
}

export interface RuntimePickerCallbacks {
  onSelect: (node: PickerNode) => void;
  onSetupComplete: (
    runtime: RuntimeKind,
    provider: ByoProviderId | undefined,
    apiKey: string,
    baseURL?: string
  ) => void | Promise<void>;
  onCancel: () => void;
}

export function useRuntimePicker(
  config: TermConfig,
  callbacks: RuntimePickerCallbacks
): UseRuntimePickerResult {
  const [state, setState] = React.useState<PickerState>({
    isOpen: false,
    level: "runtime",
    selectedIndex: 0,
    nodes: [],
    setupMode: false,
    setupApiKey: "",
    setupBaseURL: "",
  });

  const fetchGenRef = React.useRef(0);
  const configRef = React.useRef(config);
  configRef.current = config;
  const callbacksRef = React.useRef(callbacks);
  callbacksRef.current = callbacks;

  const loadOllamaModels = React.useCallback(async (forModelLevel: boolean) => {
    const gen = ++fetchGenRef.current;
    setState((prev) => {
      if (!prev.isOpen) return prev;
      const cfg = configRef.current;
      const nodes = forModelLevel
        ? buildModelNodes(cfg, "local", undefined, prev.ollamaModels, {
            loading: true,
          })
        : runtimeNodesFromState(cfg, prev);
      return {
        ...prev,
        loading: true,
        ollamaError: undefined,
        nodes:
          forModelLevel || prev.level === "runtime" ? nodes : prev.nodes,
      };
    });

    const result = await listOllamaModels();
    if (gen !== fetchGenRef.current) return;

    setState((prev) => {
      if (!prev.isOpen) return prev;
      const cfg = configRef.current;
      const ollamaModels = result.ok ? result.models : [];
      const ollamaError = result.ok ? undefined : (result.error ?? "Not running");
      const next = { ...prev, ollamaModels, ollamaError, loading: false };

      if (forModelLevel || prev.level === "model") {
        return {
          ...next,
          nodes: buildModelNodes(cfg, "local", undefined, ollamaModels, {
            ollamaError,
          }),
          selectedIndex: 0,
        };
      }

      return {
        ...next,
        nodes: runtimeNodesFromState(cfg, next),
      };
    });
  }, []);

  const loadOzwellModels = React.useCallback(
    async (forModelLevel: boolean, apiKeyOverride?: string) => {
    const gen = ++fetchGenRef.current;
    setState((prev) => {
      if (!prev.isOpen) return prev;
      const cfg = configRef.current;
      const nodes = forModelLevel
        ? buildModelNodes(cfg, "ozwell", undefined, undefined, {
            loading: true,
            ozwellModels: prev.ozwellModels,
            ozwellError: prev.ozwellError,
            ozwellUsedFallback: prev.ozwellUsedFallback,
            ozwellOtherExpanded: prev.ozwellOtherExpanded,
          })
        : runtimeNodesFromState(cfg, prev);
      return {
        ...prev,
        loading: true,
        nodes:
          forModelLevel || prev.level === "runtime" ? nodes : prev.nodes,
      };
    });

    const cfg = configRef.current;
    const result = await listOzwellModels({
      apiKey: apiKeyOverride ?? resolveOzwellApiKey(cfg),
      endpoint: resolveOzwellEndpoint(cfg),
    });
    if (gen !== fetchGenRef.current) return;

    setState((prev) => {
      if (!prev.isOpen) return prev;
      const next = {
        ...prev,
        loading: false,
        ozwellModels: result.models,
        ozwellError: result.ok ? undefined : result.error,
        ozwellUsedFallback: result.usedFallback,
      };

      if (forModelLevel || prev.level === "model") {
        return {
          ...next,
          nodes: buildModelNodes(configRef.current, "ozwell", undefined, undefined, {
            ozwellModels: result.models,
            ozwellError: result.ok ? undefined : result.error,
            ozwellUsedFallback: result.usedFallback,
            ozwellOtherExpanded: prev.ozwellOtherExpanded,
          }),
          selectedIndex: 0,
        };
      }

      return {
        ...next,
        nodes: runtimeNodesFromState(configRef.current, next),
      };
    });
  },
  []
  );

  const loadOpenAIModels = React.useCallback(
    async (forModelLevel: boolean, apiKeyOverride?: string) => {
      const gen = ++fetchGenRef.current;
      setState((prev) => {
        if (!prev.isOpen) return prev;
        const cfg = configRef.current;
        const nodes = forModelLevel
          ? buildModelNodes(cfg, "byo-cloud", "openai", undefined, {
              loading: true,
              openaiModels: prev.openaiModels,
              openaiError: prev.openaiError,
            })
          : prev.nodes;
        return {
          ...prev,
          loading: true,
          nodes: forModelLevel ? nodes : prev.nodes,
        };
      });

      const cfg = configRef.current;
      const result = await listOpenAIModels({
        apiKey: apiKeyOverride ?? resolveOpenAIApiKey(cfg),
      });
      if (gen !== fetchGenRef.current) return;

      setState((prev) => {
        if (!prev.isOpen) return prev;
        const next = {
          ...prev,
          loading: false,
          openaiModels: result.ok ? result.models : [],
          openaiError: result.ok ? undefined : result.error,
        };

        if (forModelLevel || prev.level === "model") {
          return {
            ...next,
            nodes: buildModelNodes(configRef.current, "byo-cloud", "openai", undefined, {
              openaiModels: result.ok ? result.models : [],
              openaiError: result.ok ? undefined : result.error,
            }),
            selectedIndex: 0,
          };
        }

        return next;
      });
    },
    []
  );

  const loadAnthropicModels = React.useCallback(
    async (forModelLevel: boolean, apiKeyOverride?: string) => {
      const gen = ++fetchGenRef.current;
      setState((prev) => {
        if (!prev.isOpen) return prev;
        const cfg = configRef.current;
        const nodes = forModelLevel
          ? buildModelNodes(cfg, "anthropic", "anthropic", undefined, {
              loading: true,
              anthropicModels: prev.anthropicModels,
              anthropicError: prev.anthropicError,
            })
          : prev.nodes;
        return {
          ...prev,
          loading: true,
          nodes: forModelLevel ? nodes : prev.nodes,
        };
      });

      const cfg = configRef.current;
      const result = await listAnthropicModels({
        apiKey: apiKeyOverride ?? resolveAnthropicApiKey(cfg),
      });
      if (gen !== fetchGenRef.current) return;

      setState((prev) => {
        if (!prev.isOpen) return prev;
        const next = {
          ...prev,
          loading: false,
          anthropicModels: result.ok ? result.models : [],
          anthropicError: result.ok ? undefined : result.error,
        };

        if (forModelLevel || prev.level === "model") {
          return {
            ...next,
            nodes: buildModelNodes(configRef.current, "anthropic", "anthropic", undefined, {
              anthropicModels: result.ok ? result.models : [],
              anthropicError: result.ok ? undefined : result.error,
            }),
            selectedIndex: 0,
          };
        }

        return next;
      });
    },
    []
  );

  const open = React.useCallback(
    (options?: {
      mode?: PickerLevel;
      runtime?: RuntimeKind;
      provider?: ByoProviderId;
    }) => {
      const mode = options?.mode ?? "runtime";
      let nodes: PickerNode[] = [];
      let level: PickerLevel = mode;
      const rt = options?.runtime ?? config.runtime;
      const prov = options?.provider ?? config.provider;
      let shouldFetchOllama = false;
      let shouldFetchOzwell = false;
      let shouldFetchOpenAI = false;
      let shouldFetchAnthropic = false;

      if (mode === "runtime") {
        nodes = buildRuntimeNodes(config);
        shouldFetchOllama = true;
        shouldFetchOzwell = hasCredentials(config, "ozwell", undefined);
      } else if (mode === "model") {
        const needsLoading =
          rt === "local" ||
          rt === "ozwell" ||
          (rt === "byo-cloud" && prov === "openai") ||
          rt === "anthropic";
        nodes = buildModelNodes(config, rt, prov, undefined, {
          loading: needsLoading,
        });
        level = "model";
        shouldFetchOllama = rt === "local";
        shouldFetchOzwell = rt === "ozwell";
        shouldFetchOpenAI = rt === "byo-cloud" && prov === "openai";
        shouldFetchAnthropic = rt === "anthropic";
      } else if (mode === "setup") {
        level = "setup";
      }

      setState({
        isOpen: true,
        level,
        runtime: rt,
        provider: prov,
        selectedIndex: 0,
        nodes,
        setupMode: mode === "setup",
        setupApiKey: "",
        setupBaseURL: "",
        loading:
          (shouldFetchOllama ||
            shouldFetchOzwell ||
            shouldFetchOpenAI ||
            shouldFetchAnthropic) &&
          mode === "model",
      });

      if (shouldFetchOllama) {
        void loadOllamaModels(mode === "model" && rt === "local");
      }
      if (shouldFetchOzwell) {
        void loadOzwellModels(mode === "model" && rt === "ozwell");
      }
      if (shouldFetchOpenAI) {
        void loadOpenAIModels(true);
      }
      if (shouldFetchAnthropic) {
        void loadAnthropicModels(true);
      }
    },
    [config, loadOllamaModels, loadOzwellModels, loadOpenAIModels, loadAnthropicModels]
  );

  const close = React.useCallback(() => {
    fetchGenRef.current += 1;
    setState((prev) => ({
      ...prev,
      isOpen: false,
      setupMode: false,
      setupApiKey: "",
      setupBaseURL: "",
      loading: false,
    }));
    callbacksRef.current.onCancel();
  }, []);

  const navigateBackOrClose = React.useCallback(() => {
    let shouldClose = false;
    setState((prev) => {
      if (!prev.isOpen) return prev;

      if (prev.setupMode) {
        const goToProvider =
          prev.runtime === "byo-cloud" || prev.runtime === "anthropic";
        const level: PickerLevel = goToProvider ? "provider" : "runtime";
        return {
          ...prev,
          setupMode: false,
          level,
          nodes:
            level === "provider"
              ? buildProviderNodes(configRef.current)
              : runtimeNodesFromState(configRef.current, prev),
          selectedIndex: 0,
        };
      }

      if (prev.level === "model") {
        if (prev.runtime === "byo-cloud" || prev.runtime === "anthropic") {
          return {
            ...prev,
            level: "provider",
            nodes: buildProviderNodes(configRef.current),
            selectedIndex: 0,
          };
        }
        return {
          ...prev,
          level: "runtime",
          nodes: runtimeNodesFromState(configRef.current, prev),
          selectedIndex: 0,
        };
      }

      if (prev.level === "provider") {
        return {
          ...prev,
          level: "runtime",
          nodes: runtimeNodesFromState(configRef.current, prev),
          selectedIndex: 0,
        };
      }

      shouldClose = true;
      return {
        ...prev,
        isOpen: false,
        loading: false,
      };
    });
    if (shouldClose) {
      fetchGenRef.current += 1;
      callbacksRef.current.onCancel();
    }
  }, []);

  const selectNode = React.useCallback(
    (node: PickerNode) => {
      if (node.isPlaceholder) {
        return;
      }

      // Drill into BYO providers before any setup check — setup is per-provider.
      if (node.level === "runtime" && node.runtime === "byo-cloud") {
        setState((prev) => ({
          ...prev,
          level: "provider",
          runtime: "byo-cloud",
          nodes: buildProviderNodes(configRef.current),
          selectedIndex: 0,
        }));
        return;
      }

      if (node.needsSetup) {
        setState((prev) => ({
          ...prev,
          setupMode: true,
          runtime: node.runtime,
          provider: node.provider,
          setupApiKey: "",
          setupBaseURL: "",
        }));
        return;
      }

      if (node.level === "runtime") {
        if (node.runtime === "local") {
          setState((prev) => ({
            ...prev,
            level: "model",
            runtime: "local",
            loading: true,
            nodes: buildModelNodes(
              configRef.current,
              "local",
              undefined,
              prev.ollamaModels,
              { loading: !prev.ollamaModels, ollamaError: prev.ollamaError }
            ),
            selectedIndex: 0,
          }));
          void loadOllamaModels(true);
          return;
        }

        if (node.runtime === "ozwell") {
          setState((prev) => ({
            ...prev,
            level: "model",
            runtime: "ozwell",
            loading: true,
            nodes: buildModelNodes(
              configRef.current,
              "ozwell",
              undefined,
              undefined,
              {
                loading: !prev.ozwellModels,
                ozwellModels: prev.ozwellModels,
                ozwellError: prev.ozwellError,
                ozwellUsedFallback: prev.ozwellUsedFallback,
                ozwellOtherExpanded: prev.ozwellOtherExpanded,
              }
            ),
            selectedIndex: 0,
          }));
          void loadOzwellModels(true);
          return;
        }

        setState((prev) => ({
          ...prev,
          level: "model",
          runtime: node.runtime,
          nodes: buildModelNodes(configRef.current, node.runtime!, undefined),
          selectedIndex: 0,
        }));
        return;
      }

      if (node.level === "provider") {
        const actualRuntime = node.runtime ?? "byo-cloud";

        if (actualRuntime === "byo-cloud" && node.provider === "openai") {
          setState((prev) => ({
            ...prev,
            level: "model",
            runtime: actualRuntime,
            provider: node.provider,
            loading: true,
            nodes: buildModelNodes(
              configRef.current,
              actualRuntime,
              node.provider,
              undefined,
              { loading: true, openaiModels: prev.openaiModels, openaiError: prev.openaiError }
            ),
            selectedIndex: 0,
          }));
          void loadOpenAIModels(true);
          return;
        }

        if (actualRuntime === "anthropic") {
          setState((prev) => ({
            ...prev,
            level: "model",
            runtime: actualRuntime,
            provider: node.provider,
            loading: true,
            nodes: buildModelNodes(
              configRef.current,
              actualRuntime,
              node.provider,
              undefined,
              { loading: true, anthropicModels: prev.anthropicModels, anthropicError: prev.anthropicError }
            ),
            selectedIndex: 0,
          }));
          void loadAnthropicModels(true);
          return;
        }

        setState((prev) => ({
          ...prev,
          level: "model",
          runtime: actualRuntime,
          provider: node.provider,
          nodes: buildModelNodes(
            configRef.current,
            actualRuntime,
            node.provider
          ),
          selectedIndex: 0,
        }));
        return;
      }

      if (node.level === "model" && node.isToggle) {
        setState((prev) => {
          const expanded = !prev.ozwellOtherExpanded;
          const nodes = buildModelNodes(
            configRef.current,
            "ozwell",
            undefined,
            undefined,
            {
              ozwellModels: prev.ozwellModels,
              ozwellError: prev.ozwellError,
              ozwellUsedFallback: prev.ozwellUsedFallback,
              ozwellOtherExpanded: expanded,
            }
          );
          return {
            ...prev,
            ozwellOtherExpanded: expanded,
            nodes,
            selectedIndex: clampIndex(prev.selectedIndex, nodes.length),
          };
        });
        return;
      }

      if (node.level === "model" && node.model) {
        callbacksRef.current.onSelect(node);
        fetchGenRef.current += 1;
        setState((prev) => ({ ...prev, isOpen: false, loading: false }));
      }
    },
    [loadOllamaModels, loadOzwellModels, loadOpenAIModels, loadAnthropicModels]
  );

  const onKey = React.useCallback(
    (event: KeyEvent): boolean => {
      if (!state.isOpen) return false;

      const { name } = event;

      if (name === "escape") {
        navigateBackOrClose();
        return true;
      }

      if (state.setupMode) {
        if (name === "return" && state.setupApiKey.trim()) {
          const runtime = state.runtime!;
          const provider = state.provider;
          const apiKey = state.setupApiKey.trim();
          
          // Call the async callback and wait for it
          void (async () => {
            try {
              await callbacksRef.current.onSetupComplete(
                runtime,
                provider,
                apiKey,
                state.setupBaseURL.trim() || undefined
              );

              const needsLoading =
                runtime === "local" ||
                runtime === "ozwell" ||
                (runtime === "byo-cloud" && provider === "openai") ||
                runtime === "anthropic";

              setState((prev) => ({
                ...prev,
                setupMode: false,
                setupApiKey: "",
                setupBaseURL: "",
                level: "model",
                runtime,
                provider,
                nodes: buildModelNodes(
                  configRef.current,
                  runtime,
                  provider,
                  prev.ollamaModels,
                  needsLoading ? { loading: true } : undefined
                ),
                selectedIndex: 0,
                loading: needsLoading,
              }));

              if (runtime === "local") {
                void loadOllamaModels(true);
              } else if (runtime === "ozwell") {
                void loadOzwellModels(true, apiKey);
              } else if (runtime === "byo-cloud" && provider === "openai") {
                void loadOpenAIModels(true, apiKey);
              } else if (runtime === "anthropic") {
                void loadAnthropicModels(true, apiKey);
              }
            } catch (error) {
              // If validation fails, stay in setup mode and show error
              // The error message will be shown by the caller
            }
          })();
          return true;
        }
        return false;
      }

      if (state.nodes.length === 0) return false;

      if (name === "up") {
        setState((prev) => ({
          ...prev,
          selectedIndex:
            prev.selectedIndex > 0
              ? prev.selectedIndex - 1
              : prev.nodes.length - 1,
        }));
        return true;
      }

      if (name === "down") {
        setState((prev) => ({
          ...prev,
          selectedIndex:
            prev.selectedIndex < prev.nodes.length - 1
              ? prev.selectedIndex + 1
              : 0,
        }));
        return true;
      }

      if (name === "return" || name === "right") {
        const node = state.nodes[state.selectedIndex];
        if (node && (node.model || node.isToggle)) {
          selectNode(node);
        } else if (node && (node.level === "runtime" || node.level === "provider" || node.needsSetup)) {
          selectNode(node);
        }
        return true;
      }

      if (name === "left") {
        navigateBackOrClose();
        return true;
      }

      return false;
    },
    [state, navigateBackOrClose, selectNode, loadOllamaModels, loadOzwellModels, loadOpenAIModels, loadAnthropicModels]
  );

  const setSetupApiKey = React.useCallback((key: string) => {
    setState((prev) => ({ ...prev, setupApiKey: key }));
  }, []);

  const setSetupBaseURL = React.useCallback((url: string) => {
    setState((prev) => ({ ...prev, setupBaseURL: url }));
  }, []);

  return {
    state,
    open,
    close,
    onKey,
    setSetupApiKey,
    setSetupBaseURL,
  };
}

const MAX_VISIBLE = 10;

export interface RuntimePickerProps {
  state: PickerState;
  colors: ColorPalette;
  width: number;
  onApiKeyInput?: (value: string) => void;
  onBaseURLInput?: (value: string) => void;
}

export function RuntimePicker({
  state,
  colors,
  width,
  onApiKeyInput,
  onBaseURLInput,
}: RuntimePickerProps): React.ReactNode {
  if (!state.isOpen) return null;

  const provider = state.runtime
    ? getProviderForRuntime(state.runtime, state.provider)
    : undefined;

  if (state.setupMode) {
    const needsBaseURL = state.provider === "custom";
    const title = `Setup ${provider?.name ?? state.runtime ?? "Provider"}`;
    const height = needsBaseURL ? 9 : 7;

    return (
      <box
        width={width}
        height={height}
        border
        borderColor={colors.accent}
        backgroundColor={colors.bgSecondary}
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
      >
        <text style={{ fg: colors.accent }}>
          <b>{title}</b>
        </text>
        {provider?.docsURL && (
          <text style={{ fg: colors.textMuted }}>
            Docs: {provider.docsURL}
          </text>
        )}
        <box height={1} />
        <box flexDirection="row">
          <text style={{ fg: colors.textSecondary }}>API Key: </text>
          <input
            focused={!needsBaseURL || state.setupBaseURL !== ""}
            value={state.setupApiKey}
            onInput={onApiKeyInput}
            style={{ flexGrow: 1 }}
          />
        </box>
        {needsBaseURL && (
          <box flexDirection="row">
            <text style={{ fg: colors.textSecondary }}>Base URL: </text>
            <input
              focused={state.setupBaseURL === ""}
              value={state.setupBaseURL}
              onInput={onBaseURLInput}
              style={{ flexGrow: 1 }}
              placeholder="https://..."
            />
          </box>
        )}
        <text style={{ fg: colors.textMuted }}>
          Enter to save, Esc to cancel
        </text>
      </box>
    );
  }

  if (state.nodes.length === 0) {
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
        <text style={{ fg: colors.textMuted }}>No options available</text>
      </box>
    );
  }

  const { startIndex, endIndex } = getVisibleWindow(
    state.selectedIndex,
    state.nodes.length,
    MAX_VISIBLE
  );
  const visibleNodes = state.nodes.slice(startIndex, endIndex);
  const dropdownHeight = visibleNodes.length + 4;

  const levelLabels: Record<PickerLevel, string> = {
    runtime: "Select Runtime",
    provider: "Select Provider",
    model: "Select Model",
    setup: "Setup",
  };

  const breadcrumb = [
    state.level !== "runtime" && state.runtime
      ? state.runtime === "byo-cloud" || state.runtime === "anthropic"
        ? "BYO Cloud"
        : (getProviderForRuntime(state.runtime, undefined)?.name ?? state.runtime)
      : null,
    state.level === "model" && state.provider
      ? getProviderForRuntime(
          state.runtime === "anthropic" ? "anthropic" : "byo-cloud",
          state.provider
        )?.name ?? state.provider
      : null,
  ]
    .filter(Boolean)
    .join(" > ");

  return (
    <box
      width={width}
      height={dropdownHeight}
      border
      borderColor={colors.accent}
      backgroundColor={colors.bgSecondary}
      flexDirection="column"
    >
      <box paddingLeft={1} paddingRight={1}>
        <text style={{ fg: colors.accent }}>
          <b>{levelLabels[state.level]}</b>
        </text>
        {breadcrumb && (
          <text style={{ fg: colors.textMuted }}> ({breadcrumb})</text>
        )}
      </box>
      {visibleNodes.map((node, index) => {
        const actualIndex = startIndex + index;
        const isSelected = actualIndex === state.selectedIndex;
        const hasArrow =
          node.level === "runtime" || node.level === "provider";

        return (
          <box
            key={node.id}
            width="100%"
            height={1}
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={isSelected ? colors.bgTertiary : colors.bgSecondary}
            flexDirection="row"
          >
            <text style={{ fg: isSelected ? colors.accent : colors.textPrimary }}>
              {node.label}
            </text>
            {node.description && (
              <text style={{ fg: colors.textMuted }}> {node.description}</text>
            )}
            {hasArrow && !node.needsSetup && (
              <text style={{ fg: colors.textMuted }}> →</text>
            )}
            {node.needsSetup && (
              <text style={{ fg: colors.warning ?? colors.info }}> [setup]</text>
            )}
          </box>
        );
      })}
      <box paddingLeft={1}>
        <text style={{ fg: colors.textMuted }}>
          ↑↓ navigate, Enter/→ select, Esc/← back
        </text>
      </box>
    </box>
  );
}
