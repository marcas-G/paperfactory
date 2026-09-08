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
  evidenceChainId: crypto.randomUUID(),
  projectId: crypto.randomUUID(),
  sourceType: "Hypothesis",
  sourceId: crypto.randomUUID(),
  targetType: "Citation",
  targetId: crypto.randomUUID(),
  relation: "derives-from",
  createdAt: new Date(),
  ...override,
});
