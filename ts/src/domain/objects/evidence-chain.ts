import * as Schema from "@effect/schema/Schema";

export const EvidenceChain = Schema.Struct({
  evidenceChainId: Schema.UUID,
  projectId: Schema.UUID,
  sourceType: Schema.NonEmptyString,
  sourceId: Schema.UUID,
  targetType: Schema.NonEmptyString,
  targetId: Schema.UUID,
  relation: Schema.NonEmptyString,
  createdAt: Schema.DateFromSelf,
});

export type EvidenceChain = Schema.Schema.Type<typeof EvidenceChain>;

export const createEvidenceChain = (override: Partial<EvidenceChain> = {}): EvidenceChain => ({
  evidenceChainId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  sourceType: "Hypothesis",
  sourceId: "00000000-0000-4000-a000-000000000000",
  targetType: "Citation",
  targetId: "00000000-0000-4000-a000-000000000000",
  relation: "derives-from",
  createdAt: new Date(),
  ...override,
});
