import { describe, it, expect } from "vitest";
import * as Schema from "@effect/schema/Schema";
import { PhaseRun, createPhaseRun } from "../../../src/domain/objects/phase-run";

const runUUID = "11111111-1111-4111-a111-111111111111";
const projectUUID = "22222222-2222-4222-a222-222222222222";

describe("PhaseRun Schema", () => {
  const decode = Schema.decodeSync(PhaseRun);
  const base = createPhaseRun();

  it("accepts valid phase run", () => {
    const r = decode(base);
    expect(r.status).toBe("PENDING");
    expect(r.active).toBe(false);
    expect(r.artifacts).toEqual({});
    expect(r.toolCalls).toEqual([]);
    expect(r.parentRunId).toBeNull();
    expect(r.agentOutput).toBeNull();
    expect(r.selfReview).toBeNull();
    expect(r.humanFeedback).toBeNull();
  });

  it("requires valid UUID for phaseRunId", () => {
    expect(() => decode({ ...base, phaseRunId: "invalid" })).toThrow();
  });

  it("requires valid UUID for projectId", () => {
    expect(() => decode({ ...base, projectId: "invalid" })).toThrow();
  });

  it("requires non-empty phaseName", () => {
    expect(() => decode({ ...base, phaseName: "" })).toThrow();
  });

  it("requires positive phaseVersion", () => {
    expect(() => decode({ ...base, phaseVersion: 0 })).toThrow();
    expect(() => decode({ ...base, phaseVersion: -1 })).toThrow();
  });

  it("accepts parentRunId", () => {
    const r = decode({ ...base, parentRunId: runUUID });
    expect(r.parentRunId).toBe(runUUID);
  });

  it("accepts tool calls", () => {
    const toolCall = { name: "search", args: { query: "test" } };
    const r = decode({ ...base, toolCalls: [toolCall] });
    expect(r.toolCalls).toEqual([toolCall]);
  });

  it("accepts self-review with passing result", () => {
    const selfReview = { passed: true, rounds: 2, issues: [] };
    const r = decode({ ...base, selfReview });
    expect(r.selfReview?.passed).toBe(true);
    expect(r.selfReview?.rounds).toBe(2);
    expect(r.selfReview?.issues).toEqual([]);
  });

  it("accepts self-review with blocking issues", () => {
    const selfReview = {
      passed: false,
      rounds: 1,
      issues: [{ severity: "blocking", category: "logic", message: "Contradiction found" }],
    };
    const r = decode({ ...base, selfReview });
    expect(r.selfReview?.passed).toBe(false);
    expect(r.selfReview?.issues[0].severity).toBe("blocking");
  });

  it("accepts self-review with warning issues", () => {
    const selfReview = {
      passed: true,
      rounds: 1,
      issues: [{ severity: "warning", category: "style", message: "Minor issue" }],
    };
    const r = decode({ ...base, selfReview });
    expect(r.selfReview?.issues[0].severity).toBe("warning");
  });

  it("validates self-review issue severity enum", () => {
    const selfReview = {
      passed: true,
      rounds: 1,
      issues: [{ severity: "invalid", category: "test", message: "test" }],
    };
    expect(() => decode({ ...base, selfReview })).toThrow();
  });

  it("accepts human feedback", () => {
    const r = decode({ ...base, humanFeedback: "Please revise" });
    expect(r.humanFeedback).toBe("Please revise");
  });

  it("accepts agent output", () => {
    const r = decode({ ...base, agentOutput: "Analysis complete" });
    expect(r.agentOutput).toBe("Analysis complete");
  });

  it("accepts artifacts", () => {
    const artifacts = { step1: ["output1.txt", "output2.txt"] };
    const r = decode({ ...base, artifacts });
    expect(r.artifacts).toEqual(artifacts);
  });

  it("factory with override", () => {
    const r = createPhaseRun({
      phaseRunId: runUUID,
      projectId: projectUUID,
      phaseName: "literature_search",
      phaseVersion: 1,
      status: "COMPLETED",
      active: true,
    });
    expect(r.phaseRunId).toBe(runUUID);
    expect(r.projectId).toBe(projectUUID);
    expect(r.phaseName).toBe("literature_search");
    expect(r.phaseVersion).toBe(1);
    expect(r.status).toBe("COMPLETED");
    expect(r.active).toBe(true);
  });
});

describe("createPhaseRun defaults", () => {
  it("creates a phase run with required fields", () => {
    const run = createPhaseRun({
      phaseRunId: runUUID,
      projectId: projectUUID,
      phaseName: "literature_search",
      phaseVersion: 1,
    });
    expect(run.phaseRunId).toBe(runUUID);
    expect(run.phaseName).toBe("literature_search");
    expect(run.phaseVersion).toBe(1);
    expect(run.status).toBe("PENDING");
    expect(run.active).toBe(false);
    expect(run.artifacts).toEqual({});
    expect(run.toolCalls).toEqual([]);
  });

  it("accepts override for status and selfReview", () => {
    const run = createPhaseRun({
      phaseRunId: runUUID,
      projectId: projectUUID,
      phaseName: "hypothesis_generation",
      phaseVersion: 2,
      status: "COMPLETED",
      selfReview: { passed: true, rounds: 1, issues: [] },
    });
    expect(run.status).toBe("COMPLETED");
    expect(run.selfReview?.passed).toBe(true);
    expect(run.selfReview?.rounds).toBe(1);
  });

  it("sets createdAt and updatedAt to recent timestamps", () => {
    const before = Date.now();
    const run = createPhaseRun();
    const after = Date.now();
    expect(run.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(run.createdAt.getTime()).toBeLessThanOrEqual(after);
    expect(run.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(run.updatedAt.getTime()).toBeLessThanOrEqual(after);
  });
});
