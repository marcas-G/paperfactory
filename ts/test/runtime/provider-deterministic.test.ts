import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Chunk from "effect/Chunk";
import {
  DeterministicProvider,
  DeterministicScenario,
} from "@runtime/provider-deterministic";

describe("DeterministicProvider", () => {
  it("streamResponse replays scenario content word by word", async () => {
    const scenario: DeterministicScenario = {
      name: "stream-scenario",
      responses: [
        {
          content: "one two",
          stopReason: "tool_use",
          toolCalls: [
            {
              toolCallId: "t1",
              toolName: "search",
              arguments: { query: "x" },
            },
          ],
        },
        { content: "done", stopReason: "end_turn" },
      ],
    };
    const provider = new DeterministicProvider(scenario);

    const stream = await Effect.runPromise(
      provider.streamResponse([{ role: "user", content: "first" }])
    );
    const events = await Effect.runPromise(
      Stream.runCollect(stream).pipe(Effect.map((chunk) => Chunk.toArray(chunk)))
    );

    expect(events).toMatchObject([
      { type: "text", data: "one " },
      { type: "text", data: "two " },
      { type: "tool_use" },
      { type: "stop", data: "tool_use" },
    ]);
    expect(events.filter((e) => e.type === "tool_use")).toHaveLength(1);
    expect(provider.getCallCount()).toBe(1);
  });

  it("streamResponse falls back to end_turn when scenario is exhausted", async () => {
    const provider = new DeterministicProvider({
      name: "empty-scenario",
      responses: [],
    });

    const stream = await Effect.runPromise(
      provider.streamResponse([{ role: "user", content: "anything" }])
    );
    const events = await Effect.runPromise(
      Stream.runCollect(stream).pipe(Effect.map((chunk) => Chunk.toArray(chunk)))
    );

    expect(events).toEqual([{ type: "stop", data: "end_turn" }]);
    expect(provider.getCallCount()).toBe(1);
  });
});
