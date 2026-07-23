/**
 * Helper to apply TermConfig changes to the JerryBridge.
 */

import type { JerryBridge } from "../bridge/index.ts";
import type { TermConfig } from "../config/index.ts";
import { termConfigToProfile } from "../config/index.ts";

/**
 * Apply config to bridge by switching runtime with full profile options.
 * This ensures model/apiKey/endpoint/egress changes take effect on the next turn.
 */
export function applyConfigToBridge(bridge: JerryBridge, config: TermConfig): void {
  bridge.switchRuntime(config.runtime, termConfigToProfile(config));
}
