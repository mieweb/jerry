/**
 * Hook for managing JerryBridge state and events.
 */

import { useState, useEffect, useCallback } from "react";
import type { RuntimeKind, PrivacyProfile } from "@mieweb/jerry-agent-runtime";
import type { JerryBridge } from "../../bridge/index.ts";

export interface BridgeState {
  runtimeKind: RuntimeKind;
  model: string;
  connected: boolean;
  busy: boolean;
}

export interface UseBridgeResult {
  state: BridgeState;
  switchRuntime: (kind: RuntimeKind, options?: Partial<PrivacyProfile>) => void;
}

export function useBridge(bridge: JerryBridge): UseBridgeResult {
  const profile = bridge.getProfile();
  
  const [state, setState] = useState<BridgeState>({
    runtimeKind: profile.runtime,
    model: profile.model,
    connected: true,
    busy: bridge.isActive(),
  });

  useEffect(() => {
    const unsubscribe = bridge.events.on((event) => {
      switch (event.type) {
        case "runtime-switched": {
          const newProfile = bridge.getProfile();
          setState((prev) => ({
            ...prev,
            runtimeKind: event.kind,
            model: newProfile.model,
          }));
          break;
        }
        case "turn-start":
          setState((prev) => ({ ...prev, busy: true }));
          break;
        case "turn-end":
          setState((prev) => ({ ...prev, busy: false }));
          break;
        case "error":
          setState((prev) => ({ ...prev, connected: false }));
          break;
      }
    });

    return unsubscribe;
  }, [bridge]);

  const switchRuntime = useCallback(
    (kind: RuntimeKind, options?: Partial<PrivacyProfile>) => {
      bridge.switchRuntime(kind, options);
    },
    [bridge]
  );

  return { state, switchRuntime };
}
