/**
 * UI module entry point - OpenTUI renderer.
 */

import { createCliRenderer, type CliRenderer } from "@opentui/core";
import { createRoot, type Root } from "@opentui/react";
import type { JerryBridge } from "../bridge/index.ts";
import type { TermConfig } from "../config/index.ts";
import type { CommandRegistry } from "../commands/index.ts";
import { App } from "./App.tsx";

export { App } from "./App.tsx";
export * from "./theme/index.ts";
export * from "./components/index.ts";
export * from "./hooks/index.ts";

export interface StartUiOptions {
  bridge: JerryBridge;
  config: TermConfig;
  registry: CommandRegistry;
}

let renderer: CliRenderer | null = null;
let root: Root | null = null;

export async function startUi(options: StartUiOptions): Promise<void> {
  const { bridge, config, registry } = options;

  renderer = await createCliRenderer();
  root = createRoot(renderer);

  const exitFn = () => {
    root?.unmount();
    renderer?.destroy();
    process.exit(0);
  };

  root.render(<App bridge={bridge} config={config} registry={registry} onExit={exitFn} />);

  await new Promise<void>(() => {
    // Keep alive until exit is called
  });
}
