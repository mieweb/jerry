import type {
  AgentRuntime,
  PrivacyProfile,
  RuntimeEvent,
  TurnInput,
  RuntimeKind,
} from "@mieweb/jerry-agent-runtime";
import {
  resolveRuntime,
  mergeProfile,
  DEFAULT_PRIVACY_PROFILE,
} from "@mieweb/jerry-agent-runtime";
import { BridgeEventEmitter } from "./event-emitter.ts";

interface PendingSwitch {
  kind: RuntimeKind;
  options?: Partial<PrivacyProfile>;
}

export class JerryBridge {
  private runtime: AgentRuntime;
  private activeTurn: boolean = false;
  private pendingSwitch: PendingSwitch | null = null;
  public readonly events: BridgeEventEmitter;

  constructor(initialProfile?: Partial<PrivacyProfile>) {
    const profile = initialProfile
      ? mergeProfile(initialProfile)
      : DEFAULT_PRIVACY_PROFILE;
    this.runtime = resolveRuntime(profile);
    this.events = new BridgeEventEmitter();
  }

  switchRuntime(kind: RuntimeKind, options?: Partial<PrivacyProfile>): void {
    if (this.activeTurn) {
      this.pendingSwitch = { kind, options };
      return;
    }

    this.applySwitch(kind, options);
  }

  private applySwitch(
    kind: RuntimeKind,
    options?: Partial<PrivacyProfile>
  ): void {
    const currentProfile = this.runtime.profile;
    const newProfile = mergeProfile({
      ...currentProfile,
      ...options,
      runtime: kind,
    });
    this.runtime = resolveRuntime(newProfile);
    this.events.emit({ type: "runtime-switched", kind });
  }

  async *runTurn(input: TurnInput): AsyncIterable<RuntimeEvent> {
    this.activeTurn = true;
    this.events.emit({ type: "turn-start" });

    try {
      for await (const event of this.runtime.runTurn(input)) {
        yield event;
      }
    } finally {
      this.activeTurn = false;
      this.events.emit({ type: "turn-end" });

      if (this.pendingSwitch) {
        const { kind, options } = this.pendingSwitch;
        this.pendingSwitch = null;
        this.applySwitch(kind, options);
      }
    }
  }

  getProfile(): PrivacyProfile {
    return this.runtime.profile;
  }

  getRuntimeKind(): RuntimeKind {
    return this.runtime.profile.runtime;
  }

  isActive(): boolean {
    return this.activeTurn;
  }
}
