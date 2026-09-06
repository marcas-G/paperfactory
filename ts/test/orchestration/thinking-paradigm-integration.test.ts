import { describe, it, expect, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import { InMemoryObjectStore } from "@persistence/object-store";
import { InMemoryEventStore } from "@persistence/event-store";
import { ResearchController } from "@control/controller";
import { TransitionEngine } from "@control/engine";
import { ActionRegistry } from "@control/registry";
import { ToolRegistry } from "@runtime/tools/registry";
import type { Provider, ToolDefinition, Message } from "@runtime/provider";
import type { AgentEvent } from "@runtime/agent/loop";
import { buildPhaseContext, runPhase, PHASE_CONTRACTS } from "@orchestration/phase-contracts";
import { createDeterministicProvider } from "@runtime/provider-deterministic";

describe("Thinking paradigm integration in research phases", () => {
  let objectStore: InMemoryObjectStore;
  let events: AgentEvent[];
  let stopped = false;

  beforeEach(() => {
    objectStore = new InMemoryObjectStore();
    events = [];
    stopped = false;
  });

  describe("buildPhaseContext with ToT for literature_search", () => {
    it("includes ToT keyword exploration strategies when provider is given", async () => {
      /*
        ToT beamSearch for literature_search: beamWidth=3, depth=2
        depth 0: 1 generate + 1 evaluate = 2 calls
        depth 1: 3 generate + 3 evaluate = 6 calls (from 3 beam nodes)
        Total: 8 calls
      */
      const provider = createDeterministicProvider({
        name: "tot-lit-search",
        responses: [
          /* depth 0: generate */
          { content: "Keywords: deep learning transformers---Keywords: attention mechanisms NLP---Keywords: neural architecture search", stopReason: "stop" },
          /* depth 0: evaluate */
          { content: '[{"feasibility":9,"novelty":7,"relevance":9},{"feasibility":8,"novelty":8,"relevance":8},{"feasibility":7,"novelty":9,"relevance":7}]', stopReason: "stop" },
          /* depth 1: generate for node 0 */
          { content: "A1: transformers attention---A2: deep learning architectures", stopReason: "stop" },
          /* depth 1: evaluate for node 0 */
          { content: '[{"feasibility":9,"novelty":8,"relevance":9},{"feasibility":8,"novelty":7,"relevance":8}]', stopReason: "stop" },
          /* depth 1: generate for node 1 */
          { content: "B1: attention NLP---B2: mechanisms attention", stopReason: "stop" },
          /* depth 1: evaluate for node 1 */
          { content: '[{"feasibility":8,"novelty":8,"relevance":8},{"feasibility":7,"novelty":7,"relevance":8}]', stopReason: "stop" },
          /* depth 1: generate for node 2 */
          { content: "C1: neural search---C2: architecture search", stopReason: "stop" },
          /* depth 1: evaluate for node 2 */
          { content: '[{"feasibility":7,"novelty":9,"relevance":7},{"feasibility":6,"novelty":8,"relevance":7}]', stopReason: "stop" },
        ],
      });

      const contract = PHASE_CONTRACTS.find((c) => c.name === "literature_search")!;
      const context = await buildPhaseContext(
        objectStore,
        "test-project",
        "How do transformers work?",
        contract,
        provider,
      );

      // Context should include ToT exploration results
      expect(context).toContain("[ToT 关键词探索推荐]");
      expect(context).toContain("transformers attention");
      // Provider must have been called (not hardcoded)
      expect(provider.getCallCount()).toBeGreaterThan(0);
    });

    it("works without provider (graceful degradation)", async () => {
      const contract = PHASE_CONTRACTS.find((c) => c.name === "literature_search")!;
      const context = await buildPhaseContext(
        objectStore,
        "test-project",
        "How do transformers work?",
        contract,
      );

      // Should not contain ToT results
      expect(context).not.toContain("[ToT 关键词探索推荐]");
      expect(context).toContain("研究问题: How do transformers work?");
      expect(context).toContain("当前阶段: 文献调研");
    });

    it("handles ToT failure gracefully", async () => {
      const failingProvider = {
        sendMessages: () => Effect.fail("provider error"),
        streamResponse: () => Effect.fail("not implemented"),
      } as Provider;

      const contract = PHASE_CONTRACTS.find((c) => c.name === "literature_search")!;
      const context = await buildPhaseContext(
        objectStore,
        "test-project",
        "Test question",
        contract,
        failingProvider,
      );

      // Should still work without ToT
      expect(context).toContain("研究问题: Test question");
      expect(context).not.toContain("[ToT 关键词探索推荐]");
    });

    it("does not add ToT for non-literature_search phases", async () => {
      const provider = createDeterministicProvider({
        name: "tot-other-phase",
        responses: [
          { content: "Some thought", stopReason: "stop" },
        ],
      });

      const contract = PHASE_CONTRACTS.find((c) => c.name === "hypothesis_generation")!;
      const context = await buildPhaseContext(
        objectStore,
        "test-project",
        "Test question",
        contract,
        provider,
      );

      // ToT should NOT be triggered for hypothesis_generation
      expect(context).not.toContain("[ToT 关键词探索推荐]");
      // Provider should NOT have been called for context building
      expect(provider.getCallCount()).toBe(0);
    });
  });

  describe("runPhase hypothesis_generation with ToT + Debate", () => {
    it("runs ToT and Debate to select best hypothesis", async () => {
      /*
        Phase flow for hypothesis_generation:
        1. Agent loop: 1 call (returns initial output)
        2. CoVe: 1 call (returns [], early return)
        3. Self-review: 1 call
        4. ToT: beamWidth=5, depth=2
           depth 0: 1 gen + 1 eval = 2
           depth 1: 5 gen + 5 eval = 10
           Total ToT: 12
        5. Debate (up to 3 hypotheses): 3 rounds * 3 calls each = 9 per hypothesis
           We need 3 hypotheses debated, so 3 * 3 * 3 = 27
        Total: 3 + 12 + 27 = 42 calls
      */
      const responses: Array<{ content: string; stopReason: string }> = [];

      // Agent loop response
      responses.push({
        content: JSON.stringify({
          hypotheses: [
            { statement: "H1: X causes Y", researchValue: "High", falsificationCondition: "X does not cause Y" },
            { statement: "H2: Z mediates X-Y", researchValue: "Medium", falsificationCondition: "Z has no effect" },
            { statement: "H3: Y causes X", researchValue: "Low", falsificationCondition: "Y has no effect on X" },
          ],
        }),
        stopReason: "end_turn",
      });

      // CoVe: claim extraction (returns empty, early return)
      responses.push({ content: '[]', stopReason: "stop" });

      // Self-review
      responses.push({
        content: JSON.stringify({
          passed: true,
          issues: [],
        }),
        stopReason: "stop",
      });

      // ToT: depth 0 generate
      responses.push({
        content: "Candidate 1: X directly causes Y through mechanism A---Candidate 2: X indirectly causes Y via Z---Candidate 3: Y and X are correlated but not causal---Candidate 4: X prevents Y---Candidate 5: X and Y are independent",
        stopReason: "stop",
      });
      // ToT: depth 0 evaluate
      responses.push({
        content: '[{"feasibility":9,"novelty":8,"relevance":9},{"feasibility":8,"novelty":7,"relevance":8},{"feasibility":7,"novelty":9,"relevance":7},{"feasibility":6,"novelty":6,"relevance":6},{"feasibility":5,"novelty":5,"relevance":5}]',
        stopReason: "stop",
      });
      // ToT: depth 1 - 5 nodes generate + evaluate
      for (let i = 0; i < 5; i++) {
        responses.push({
          content: `Child ${i}A---Child ${i}B`,
          stopReason: "stop",
        });
        responses.push({
          content: `[{"feasibility":${9 - i},"novelty":${7 + i},"relevance":${8}},{"feasibility":${7 + i},"novelty":${8 - i},"relevance":${7}}]`,
          stopReason: "stop",
        });
      }

      // Debate: 3 hypotheses, 3 rounds each = 27 calls (3 per round: pro, con, judge)
      for (let h = 0; h < 3; h++) {
        for (let r = 0; r < 3; r++) {
          responses.push({ content: `Pro argument for hypothesis ${h + 1} round ${r + 1}`, stopReason: "stop" });
          responses.push({ content: `Con argument for hypothesis ${h + 1} round ${r + 1}`, stopReason: "stop" });
          responses.push({
            content: `Judge: hypothesis ${h + 1} has merit. Confidence: ${0.9 - h * 0.15}`,
            stopReason: "stop",
          });
        }
      }

      const provider = createDeterministicProvider({
        name: "hypothesis-tot-debate",
        responses,
      });

      const contract = PHASE_CONTRACTS.find((c) => c.name === "hypothesis_generation")!;
      const result = await runPhase(
        contract,
        objectStore,
        provider,
        new ToolRegistry(),
        [],
        "00000000-0000-4000-a000-000000000000",
        "Does X cause Y?",
        (e) => events.push(e),
        () => stopped,
      );

      // Phase should complete
      expect(result.status).toBe("COMPLETED");
      // Output should include debate selection
      const parsed = result.output as any;
      expect(parsed.debateSelection).toBeDefined();
      expect(parsed.debateSelection.selected).toBeDefined();
      expect(parsed.debateSelection.confidence).toBeDefined();
      expect(Array.isArray(parsed.debateSelection.allDebateResults)).toBe(true);
      // Best hypothesis should be Candidate 1 (confidence 0.9)
      expect(parsed.debateSelection.confidence).toBe(0.9);
      // Provider must have been called (not hardcoded)
      expect(provider.getCallCount()).toBeGreaterThan(10);
    });

    it("handles provider running out of responses with degraded output", async () => {
      /*
        Phase flow:
        1. Agent loop: 1 call
        2. CoVe: 1 call (returns [], early return)
        3. Self-review: 1 call
        4. ToT + Debate: runs but provider returns error messages (degraded)
        Total baseline: 3 calls
      */
      const responses: Array<{ content: string; stopReason: string }> = [];

      // Agent loop
      responses.push({
        content: JSON.stringify({
          hypotheses: [
            { statement: "H1", researchValue: "High", falsificationCondition: "Not H1" },
          ],
        }),
        stopReason: "end_turn",
      });
      // CoVe
      responses.push({ content: '[]', stopReason: "stop" });
      // Self-review
      responses.push({
        content: JSON.stringify({
          passed: true,
          issues: [],
        }),
        stopReason: "stop",
      });

      const provider = createDeterministicProvider({
        name: "hypothesis-degraded",
        responses,
      });

      const contract = PHASE_CONTRACTS.find((c) => c.name === "hypothesis_generation")!;
      const result = await runPhase(
        contract,
        objectStore,
        provider,
        new ToolRegistry(),
        [],
        "00000000-0000-4000-a000-000000000000",
        "Does X cause Y?",
        () => {},
        () => stopped,
      );

      // Should still complete (graceful degradation - provider returns error messages, not throws)
      expect(result.status).toBe("COMPLETED");
      // Output should have hypotheses
      expect((result.output as any)?.hypotheses).toBeDefined();
      // debateSelection will be present but with degraded data (provider exhausted)
      // The key: provider was called way more than the 4 baseline calls
      expect(provider.getCallCount()).toBeGreaterThan(4);
    });
  });

  describe("runPhase evidence_assessment with Self-Consistency", () => {
    it("runs sampleConsensus for each evidence item", async () => {
      /*
        Phase flow:
        1. Agent loop: 1 call
        2. CoVe: 1 call (returns [], early return)
        3. Self-review: 1 call
        4. Self-Consensus: 7 samples per evidence item (2 items) = 14 calls
        Total: 17 calls
      */
      const responses: Array<{ content: string; stopReason: string }> = [];

      // Agent loop
      responses.push({
        content: JSON.stringify({
          assessments: [
            { evidenceId: "e1", direction: "SUPPORTING", strength: 0.9, reasoning: "Strong correlation found" },
            { evidenceId: "e2", direction: "CONFLICTING", strength: 0.3, reasoning: "Contradictory results" },
          ],
          conclusion: { status: "NEEDS_MORE_RESEARCH", reasoning: "Mixed evidence" },
        }),
        stopReason: "end_turn",
      });
      // CoVe claim extraction (returns empty, early return)
      responses.push({ content: '[]', stopReason: "stop" });
      // Self-review
      responses.push({
        content: JSON.stringify({
          passed: true,
          issues: [],
        }),
        stopReason: "stop",
      });
      // Self-Consensus: 7 samples for evidence 1
      for (let i = 0; i < 7; i++) {
        responses.push({ content: `Relevance: 9, Reliability: 8, Impact: 9`, stopReason: "stop" });
      }
      // Self-Consensus: 7 samples for evidence 2
      for (let i = 0; i < 7; i++) {
        responses.push({ content: `Relevance: 3, Reliability: 2, Impact: 3`, stopReason: "stop" });
      }

      const provider = createDeterministicProvider({
        name: "evidence-self-consistency",
        responses,
      });

      const contract = PHASE_CONTRACTS.find((c) => c.name === "evidence_assessment")!;
      const result = await runPhase(
        contract,
        objectStore,
        provider,
        new ToolRegistry(),
        [],
        "00000000-0000-4000-a000-000000000000",
        "Does X cause Y?",
        () => {},
        () => stopped,
      );

      expect(result.status).toBe("COMPLETED");
      const parsed = result.output as any;
      expect(parsed.assessments).toBeDefined();
      expect(parsed.assessments.length).toBe(2);
      // Each assessment should have consensusScore added
      expect(parsed.assessments[0].consensusScore).toBeDefined();
      expect(parsed.assessments[0].consensusAnswer).toBeDefined();
      expect(parsed.assessments[1].consensusScore).toBeDefined();
      // Provider must have been called for consensus (not hardcoded)
      expect(provider.getCallCount()).toBeGreaterThanOrEqual(14);
    });

    it("handles provider exhaustion with degraded self-consistency", async () => {
      const responses: Array<{ content: string; stopReason: string }> = [];
      responses.push({
        content: JSON.stringify({
          assessments: [{ evidenceId: "e1", direction: "SUPPORTING", strength: 0.9, reasoning: "Strong" }],
          conclusion: { status: "CONFIRMED", reasoning: "R" },
        }),
        stopReason: "end_turn",
      });
      responses.push({ content: '[]', stopReason: "stop" });
      responses.push({
        content: JSON.stringify({
          passed: true,
          issues: [],
        }),
        stopReason: "stop",
      });

      const provider = createDeterministicProvider({
        name: "evidence-sc-degraded",
        responses,
      });

      const contract = PHASE_CONTRACTS.find((c) => c.name === "evidence_assessment")!;
      const result = await runPhase(
        contract,
        objectStore,
        provider,
        new ToolRegistry(),
        [],
        "00000000-0000-4000-a000-000000000000",
        "Test?",
        () => {},
        () => stopped,
      );

      expect(result.status).toBe("COMPLETED");
      expect((result.output as any)?.assessments).toBeDefined();
      // Provider called more than 3 (baseline: agent + CoVe + self-review)
      expect(provider.getCallCount()).toBeGreaterThan(3);
    });
  });

  describe("runPhase report_generation with Debate (peer review)", () => {
    it("runs debate for peer review simulation", async () => {
      /*
        Phase flow:
        1. Agent loop: 1 call
        2. CoVe: 1 call (returns [], early return)
        3. Self-review: 1 call
        4. Debate: 3 rounds * 3 calls (pro, con, judge) = 9 calls
        Total: 12 calls
      */
      const responses: Array<{ content: string; stopReason: string }> = [];

      // Agent loop
      responses.push({
        content: JSON.stringify({
          abstract: "This study investigates X.",
          sections: [{ title: "Introduction", content: "Background on X." }],
        }),
        stopReason: "end_turn",
      });
      // CoVe claim extraction (returns empty, early return)
      responses.push({ content: '[]', stopReason: "stop" });
      // Self-review
      responses.push({
        content: JSON.stringify({
          passed: true,
          issues: [],
        }),
        stopReason: "stop",
      });
      // Debate: 3 rounds, each with pro/con/judge = 9 calls
      for (let r = 0; r < 3; r++) {
        responses.push({ content: `Pro: The report is well-structured and evidence-based.`, stopReason: "stop" });
        responses.push({ content: `Con: The report lacks methodological detail.`, stopReason: "stop" });
        responses.push({ content: `Judge: Report has merit but needs improvement. Confidence: 0.75`, stopReason: "stop" });
      }

      const provider = createDeterministicProvider({
        name: "report-debate-peer-review",
        responses,
      });

      const contract = PHASE_CONTRACTS.find((c) => c.name === "report_generation")!;
      const result = await runPhase(
        contract,
        objectStore,
        provider,
        new ToolRegistry(),
        [],
        "00000000-0000-4000-a000-000000000000",
        "Does X cause Y?",
        () => {},
        () => stopped,
      );

      expect(result.status).toBe("COMPLETED");
      const parsed = result.output as any;
      expect(parsed.peerReview).toBeDefined();
      expect(parsed.peerReview.conclusion).toBeDefined();
      expect(parsed.peerReview.confidence).toBe(0.75);
      expect(Array.isArray(parsed.peerReview.rounds)).toBe(true);
      expect(parsed.peerReview.rounds.length).toBe(3);
      // Provider must have been called (not hardcoded)
      expect(provider.getCallCount()).toBeGreaterThanOrEqual(10);
    });

    it("handles provider exhaustion with degraded peer review", async () => {
      /*
        Phase flow:
        1. Agent loop: 1 call
        2. CoVe: 1 call (returns [], early return)
        3. Self-review: 1 call
        4. Debate: runs but provider exhausted (error messages returned)
        Total: 3 baseline + 9 debate = 12 calls (provider has 3, rest are error messages)
      */
      const responses: Array<{ content: string; stopReason: string }> = [];
      responses.push({
        content: JSON.stringify({
          abstract: "Test abstract.",
          sections: [{ title: "Intro", content: "Content." }],
        }),
        stopReason: "end_turn",
      });
      responses.push({ content: '[]', stopReason: "stop" });
      responses.push({
        content: JSON.stringify({
          passed: true,
          issues: [],
        }),
        stopReason: "stop",
      });

      const provider = createDeterministicProvider({
        name: "report-debate-degraded",
        responses,
      });

      const contract = PHASE_CONTRACTS.find((c) => c.name === "report_generation")!;
      const result = await runPhase(
        contract,
        objectStore,
        provider,
        new ToolRegistry(),
        [],
        "00000000-0000-4000-a000-000000000000",
        "Test?",
        () => {},
        () => stopped,
      );

      expect(result.status).toBe("COMPLETED");
      expect((result.output as any)?.abstract).toBeDefined();
      // provider was called for debate (more than baseline 3)
      expect(provider.getCallCount()).toBeGreaterThan(3);
    });
  });

  describe("Non-enhanced phases are unaffected", () => {
    it("gap_identification does not trigger thinking paradigm", async () => {
      const responses: Array<{ content: string; stopReason: string }> = [];
      responses.push({
        content: JSON.stringify({
          gaps: [{ description: "Gap 1", evidenceOfGap: "E1", researchValue: "V1" }],
        }),
        stopReason: "end_turn",
      });
      responses.push({ content: '[]', stopReason: "stop" });
      responses.push({
        content: JSON.stringify({
          passed: true,
          issues: [],
        }),
        stopReason: "stop",
      });

      const provider = createDeterministicProvider({
        name: "gap-no-enhancement",
        responses,
      });

      const contract = PHASE_CONTRACTS.find((c) => c.name === "gap_identification")!;
      const result = await runPhase(
        contract,
        objectStore,
        provider,
        new ToolRegistry(),
        [],
        "00000000-0000-4000-a000-000000000000",
        "Test?",
        () => {},
        () => stopped,
      );

      expect(result.status).toBe("COMPLETED");
      // Should only have 3 calls (agent + CoVe + self-review), no extra paradigm calls
      expect(provider.getCallCount()).toBeLessThanOrEqual(4);
      // No debateSelection, peerReview, or consensusScore
      const parsed = result.output as any;
      expect(parsed.debateSelection).toBeUndefined();
      expect(parsed.peerReview).toBeUndefined();
    });
  });
});
