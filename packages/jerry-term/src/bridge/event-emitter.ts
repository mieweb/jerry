import type { RuntimeKind } from "@mieweb/jerry-agent-runtime";

export type BridgeEvent =
  | { type: "runtime-switched"; kind: RuntimeKind }
  | { type: "turn-start" }
  | { type: "turn-end" }
  | { type: "error"; message: string };

export type BridgeEventHandler = (event: BridgeEvent) => void;

export class BridgeEventEmitter {
  private listeners: BridgeEventHandler[] = [];

  on(handler: BridgeEventHandler): () => void {
    this.listeners.push(handler);
    return () => {
      const index = this.listeners.indexOf(handler);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  emit(event: BridgeEvent): void {
    for (const handler of this.listeners) {
      handler(event);
    }
  }
}
