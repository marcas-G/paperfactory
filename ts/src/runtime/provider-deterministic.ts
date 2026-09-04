import * as Effect from "effect/Effect";
import type { Stream } from "effect/Stream";
import * as StreamNS from "effect/Stream";
import type { Provider, ProviderResponse, Message, ProviderOptions, StreamEvent } from "./provider";

export interface DeterministicScenario {
  name: string;
  responses: ReadonlyArray<ProviderResponse>;
}

export class DeterministicProvider implements Provider {
  private callIndex = 0;
  constructor(private scenario: DeterministicScenario) {}

  getCallCount(): number {
    return this.callIndex;
  }

  sendMessages(
    _messages: ReadonlyArray<Message>,
    _options?: ProviderOptions
  ): Effect.Effect<ProviderResponse, string> {
    const idx = this.callIndex++;
    if (idx >= this.scenario.responses.length) {
      return Effect.succeed({
        content: `Unexpected call ${idx}. Scenario '${this.scenario.name}' only has ${this.scenario.responses.length} responses.`,
        stopReason: "stop",
      });
    }
    return Effect.succeed(this.scenario.responses[idx]);
  }

  streamResponse(
    _messages: ReadonlyArray<Message>,
    _options?: ProviderOptions
  ): Effect.Effect<Stream<StreamEvent, never>, string> {
    const idx = this.callIndex++;
    if (idx >= this.scenario.responses.length) {
      return Effect.succeed(StreamNS.fromIterable([{ type: "stop", data: "end_turn" }]));
    }
    const resp = this.scenario.responses[idx];
    const events: StreamEvent[] = [];
    const words = resp.content.split(" ");
    for (const word of words) {
      events.push({ type: "text", data: word + " " });
    }
    if (resp.toolCalls) {
      for (const tc of resp.toolCalls) {
        events.push({ type: "tool_use", data: tc });
      }
    }
    events.push({ type: "stop", data: resp.stopReason });
    return Effect.succeed(StreamNS.fromIterable(events));
  }
}

export function createDeterministicProvider(scenario: DeterministicScenario): DeterministicProvider {
  return new DeterministicProvider(scenario);
}
