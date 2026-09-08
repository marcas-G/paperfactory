import { describe, it, expect, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import { InMemoryObjectStore } from "@pf/core/persistence/object-store";
import { InMemoryEventStore } from "@pf/core/persistence/event-store";
import { ResearchController } from "@pf/core/control/controller";
import { TransitionEngine } from "@pf/core/control/engine";
import { ActionRegistry } from "@pf/core/control/registry";
import { ToolRegistry } from "@pf/core/runtime/tools/registry";
import type { Provider, ToolDefinition, Message } from "@pf/core/runtime/provider";
import type { AgentEvent } from "@pf/core/runtime/agent/loop";
import { runAgentDrivenResearch } from "@pf/research/agent-research";
import { PHASE_CONTRACTS } from "@pf/research/phase-contracts";

class SequentialProvider implements Provider {
  private index = 0;
  constructor(private responses: string[]) {}

  getCallCount(): number {
    return this.index;
  }

  sendMessages(
    _messages: ReadonlyArray<Message>,
    _options?: { model?: string; temperature?: number; maxTokens?: number; tools?: ReadonlyArray<ToolDefinition> }
  ): Effect.Effect<{ content: string; toolCalls?: ReadonlyArray<{ toolCallId: string; toolName: string; arguments: Record<string, unknown> }>; stopReason: string }, string> {
    const idx = this.index++;
    const content = idx < this.responses.length ? this.responses[idx] : "{}";
    return Effect.succeed({
      content,
      stopReason: "end_turn",
    });
  }

  streamResponse(
    _messages: ReadonlyArray<Message>,
    _options?: { model?: string; temperature?: number; maxTokens?: number; tools?: ReadonlyArray<ToolDefinition> }
  ): Effect.Effect<any, string> {
    return Effect.succeed(null as any);
  }
}

describe("runAgentDrivenResearch", () => {
  let objectStore: InMemoryObjectStore;
  let eventStore: InMemoryEventStore;
  let controller: ResearchController;
  let provider: SequentialProvider;
  let events: AgentEvent[];
  let stopped = false;

  beforeEach(() => {
    objectStore = new InMemoryObjectStore();
    eventStore = new InMemoryEventStore();
    controller = new ResearchController(
      objectStore,
      eventStore,
      new TransitionEngine(),
      new ActionRegistry()
    );
    events = [];
    stopped = false;
  });

  it("runs all phases and returns results for each phase", async () => {
    // Provider returns JSON for each agent loop call + self-review calls
    // Each phase: 1 agent loop response + 1 self-review response = 2 calls
    // 8 phases = 16 calls minimum
    const responses: string[] = [];
    for (let i = 0; i < 20; i++) {
      responses.push(
        JSON.stringify({
          keyFindings: [{ finding: "Finding", sourceTitle: "Paper", sourceUrl: "https://example.com" }],
          researchGaps: [{ gap: "Gap 1", whyItMatters: "Important" }],
          methodologies: ["Method A"],
          hypotheses: [{ statement: "X causes Y", researchValue: "High", falsificationCondition: "X does not cause Y" }],
          design: { objective: "Test X", variables: ["A"], controls: ["B"] },
          expectedResults: "X increases Y",
          falsificationCriteria: "X does not increase Y",
          assessments: [{ evidenceId: "e1", direction: "SUPPORTING", strength: 0.9, reasoning: "Strong evidence" }],
          conclusion: { status: "CONFIRMED", reasoning: "Evidence supports hypothesis" },
          status: "CONFIRMED",
          reasoning: "Strong evidence",
          researchValue: "Significant",
          abstract: "Test abstract",
          sections: [{ title: "Intro", content: "Introduction text" }],
          gaps: [{ description: "Gap", evidenceOfGap: "No prior work", researchValue: "High" }],
          output: "experiment output",
          analysis: "Analysis complete",
          direction: "SUPPORTING",
          strength: 0.85,
        })
      );
    }
    provider = new SequentialProvider(responses);

    const result = await runAgentDrivenResearch({
      projectId: "00000000-0000-4000-a000-000000000000",
      branchId: "00000000-0000-4000-a000-000000000000",
      question: "Does X cause Y?",
      provider,
      objectStore,
      eventStore,
      controller,
      toolRegistry: new ToolRegistry(),
      toolDefinitions: [],
      onEvent: (e) => events.push(e),
      shouldStop: () => stopped,
    });

    // All 8 phases should have been attempted
    expect(result.phases.length).toBe(PHASE_CONTRACTS.length);
    expect(result.phases.every((p) => p.phaseName.length > 0)).toBe(true);
  });

  it("tracks phase versions incrementally", async () => {
    const responses: string[] = [];
    for (let i = 0; i < 20; i++) {
      responses.push(
        JSON.stringify({
          keyFindings: [{ finding: "F1", sourceTitle: "P1", sourceUrl: "https://example.com" }],
          researchGaps: [],
          methodologies: [],
          hypotheses: [],
          design: { objective: "Test", variables: [], controls: [] },
          expectedResults: "",
          falsificationCriteria: "X",
          assessments: [],
          conclusion: { status: "CONFIRMED", reasoning: "R" },
          status: "CONFIRMED",
          reasoning: "R",
          researchValue: "V",
          abstract: "A",
          sections: [],
          gaps: [],
          output: "out",
          analysis: "A",
          direction: "SUPPORTING",
          strength: 0.5,
        })
      );
    }
    provider = new SequentialProvider(responses);

    await runAgentDrivenResearch({
      projectId: "00000000-0000-4000-a000-000000000000",
      branchId: "00000000-0000-4000-a000-000000000000",
      question: "Test?",
      provider,
      objectStore,
      eventStore,
      controller,
      toolRegistry: new ToolRegistry(),
      toolDefinitions: [],
      onEvent: () => {},
      shouldStop: () => stopped,
    });

    // Check that PhaseRun objects were saved with version tracking
    const phaseRuns = await Effect.runPromise(objectStore.list("PhaseRun"));
    expect(phaseRuns.length).toBeGreaterThan(0);

    // Each phase run should have a version >= 1
    for (const run of phaseRuns) {
      expect((run as any).phaseVersion).toBeGreaterThanOrEqual(1);
    }

    // Check that phase runs have correct structure
    const firstRun = phaseRuns[0] as any;
    expect(firstRun.phaseRunId).toBeDefined();
    expect(firstRun.projectId).toBe("00000000-0000-4000-a000-000000000000");
    expect(firstRun.phaseName).toBeDefined();
    expect(firstRun.status).toBeDefined();
    expect(firstRun.active).toBe(true);
  });

  it("emits phase events via onEvent callback", async () => {
    const responses: string[] = [];
    for (let i = 0; i < 20; i++) {
      responses.push(
        JSON.stringify({
          keyFindings: [{ finding: "F1", sourceTitle: "P1", sourceUrl: "https://example.com" }],
          researchGaps: [],
          methodologies: [],
          hypotheses: [],
          design: { objective: "Test", variables: [], controls: [] },
          expectedResults: "",
          falsificationCriteria: "X",
          assessments: [],
          conclusion: { status: "CONFIRMED", reasoning: "R" },
          status: "CONFIRMED",
          reasoning: "R",
          researchValue: "V",
          abstract: "A",
          sections: [],
          gaps: [],
          output: "out",
          analysis: "A",
          direction: "SUPPORTING",
          strength: 0.5,
        })
      );
    }
    provider = new SequentialProvider(responses);

    await runAgentDrivenResearch({
      projectId: "00000000-0000-4000-a000-000000000000",
      branchId: "00000000-0000-4000-a000-000000000000",
      question: "Test?",
      provider,
      objectStore,
      eventStore,
      controller,
      toolRegistry: new ToolRegistry(),
      toolDefinitions: [],
      onEvent: (e) => events.push(e),
      shouldStop: () => stopped,
    });

    // Should have phase:start and phase:complete events
    const phaseStartEvents = events.filter((e) => e.type === "phase:start");
    const phaseCompleteEvents = events.filter((e) => e.type === "phase:complete");
    expect(phaseStartEvents.length).toBeGreaterThan(0);
    expect(phaseCompleteEvents.length).toBeGreaterThan(0);
  });

  it("respects shouldStop and skips remaining phases", async () => {
    const responses: string[] = [];
    for (let i = 0; i < 20; i++) {
      responses.push(
        JSON.stringify({
          keyFindings: [{ finding: "F1", sourceTitle: "P1", sourceUrl: "https://example.com" }],
          researchGaps: [],
          methodologies: [],
          hypotheses: [],
          design: { objective: "Test", variables: [], controls: [] },
          expectedResults: "",
          falsificationCriteria: "X",
          assessments: [],
          conclusion: { status: "CONFIRMED", reasoning: "R" },
          status: "CONFIRMED",
          reasoning: "R",
          researchValue: "V",
          abstract: "A",
          sections: [],
          gaps: [],
          output: "out",
          analysis: "A",
          direction: "SUPPORTING",
          strength: 0.5,
        })
      );
    }
    provider = new SequentialProvider(responses);

    // Stop after first phase
    let phasesRun = 0;
    const originalOnEvent = (e: AgentEvent) => {
      if (e.type === "phase:start") phasesRun++;
      if (phasesRun > 1) stopped = true;
    };

    await runAgentDrivenResearch({
      projectId: "00000000-0000-4000-a000-000000000000",
      branchId: "00000000-0000-4000-a000-000000000000",
      question: "Test?",
      provider,
      objectStore,
      eventStore,
      controller,
      toolRegistry: new ToolRegistry(),
      toolDefinitions: [],
      onEvent: originalOnEvent,
      shouldStop: () => stopped,
    });

    // At least one phase ran, fewer than all
    expect(phasesRun).toBeGreaterThan(1);
    expect(phasesRun).toBeLessThan(PHASE_CONTRACTS.length);
  });

  it("saves PhaseRun with artifacts and self-review data", async () => {
    const responses: string[] = [];
    for (let i = 0; i < 20; i++) {
      responses.push(
        JSON.stringify({
          keyFindings: [{ finding: "F1", sourceTitle: "P1", sourceUrl: "https://example.com" }],
          researchGaps: [],
          methodologies: [],
          hypotheses: [],
          design: { objective: "Test", variables: [], controls: [] },
          expectedResults: "",
          falsificationCriteria: "X",
          assessments: [],
          conclusion: { status: "CONFIRMED", reasoning: "R" },
          status: "CONFIRMED",
          reasoning: "R",
          researchValue: "V",
          abstract: "A",
          sections: [],
          gaps: [],
          output: "out",
          analysis: "A",
          direction: "SUPPORTING",
          strength: 0.5,
        })
      );
    }
    provider = new SequentialProvider(responses);

    await runAgentDrivenResearch({
      projectId: "00000000-0000-4000-a000-000000000000",
      branchId: "00000000-0000-4000-a000-000000000000",
      question: "Test?",
      provider,
      objectStore,
      eventStore,
      controller,
      toolRegistry: new ToolRegistry(),
      toolDefinitions: [],
      onEvent: () => {},
      shouldStop: () => stopped,
    });

    const phaseRuns = await Effect.runPromise(objectStore.list("PhaseRun"));
    // At least one PhaseRun should have artifacts (saved object IDs)
    const withArtifacts = phaseRuns.filter(
      (r: any) => r.artifacts && Object.keys(r.artifacts).length > 0
    );
    expect(withArtifacts.length).toBeGreaterThan(0);

    // At least one PhaseRun should have selfReview data (not null)
    const withSelfReview = phaseRuns.filter(
      (r: any) => r.selfReview !== null && r.selfReview !== undefined
    );
    expect(withSelfReview.length).toBeGreaterThan(0);
  });

  it("supports startFromPhase to skip earlier phases", async () => {
    const responses: string[] = [];
    for (let i = 0; i < 20; i++) {
      responses.push(
        JSON.stringify({
          keyFindings: [{ finding: "F1", sourceTitle: "P1", sourceUrl: "https://example.com" }],
          researchGaps: [],
          methodologies: [],
          hypotheses: [],
          design: { objective: "Test", variables: [], controls: [] },
          expectedResults: "",
          falsificationCriteria: "X",
          assessments: [],
          conclusion: { status: "CONFIRMED", reasoning: "R" },
          status: "CONFIRMED",
          reasoning: "R",
          researchValue: "V",
          abstract: "A",
          sections: [],
          gaps: [],
          output: "out",
          analysis: "A",
          direction: "SUPPORTING",
          strength: 0.5,
        })
      );
    }
    provider = new SequentialProvider(responses);

    const result = await runAgentDrivenResearch({
      projectId: "00000000-0000-4000-a000-000000000000",
      branchId: "00000000-0000-4000-a000-000000000000",
      question: "Test?",
      provider,
      objectStore,
      eventStore,
      controller,
      toolRegistry: new ToolRegistry(),
      toolDefinitions: [],
      onEvent: () => {},
      shouldStop: () => stopped,
      startFromPhase: "hypothesis_generation",
    });

    // Should start from hypothesis_generation, not literature_search
    expect(result.phases.length).toBeLessThan(PHASE_CONTRACTS.length);
    expect(result.phases[0].phaseName).toBe("hypothesis_generation");
  });
});
