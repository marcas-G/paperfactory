import * as Schema from "@effect/schema/Schema";

export const Claim = Schema.Struct({
  claimId: Schema.UUID,
  projectId: Schema.UUID,
  branchId: Schema.UUID,
  hypothesisId: Schema.NullOr(Schema.UUID),
  statement: Schema.NonEmptyString,
  supportingEvidenceIds: Schema.Array(Schema.UUID),
  status: Schema.Enums({
    PROPOSED: "PROPOSED",
    VALIDATED: "VALIDATED",
    RETRACTED: "RETRACTED",
  }),
  scope: Schema.String,
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
});

export type Claim = Schema.Schema.Type<typeof Claim>;

export type EvidenceInput = {
  evidenceId: string;
  scope: string;
};

export const createClaim = (override: Partial<Claim> = {}): Claim => ({
  claimId: "00000000-0000-4000-a000-000000000000",
  projectId: "00000000-0000-4000-a000-000000000000",
  branchId: "00000000-0000-4000-a000-000000000000",
  hypothesisId: null,
  statement: "Claim statement",
  supportingEvidenceIds: [],
  status: "PROPOSED",
  scope: "",
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...override,
});

/**
 * Validates that Claim's scope is within the scope of its supporting evidence.
 * Design §4.3: "Claim 的范围 ⊆ 支持它的 Evidence 的范围"
 * "不能用局部证据支持过宽结论"
 *
 * Returns { isOk: true } if valid, { isOk: false, message } if invalid.
 */
export function validateClaimScope(
  claim: Claim,
  evidenceList: EvidenceInput[],
): { isOk: true } | { isOk: false; message: string } {
  // Empty scope with no evidence is allowed (DRAFT state)
  if (claim.scope.trim().length === 0 && claim.supportingEvidenceIds.length === 0) {
    return { isOk: true };
  }

  // Non-empty scope requires at least one supporting evidence
  if (claim.scope.trim().length > 0 && claim.supportingEvidenceIds.length === 0) {
    return { isOk: false, message: "Claim with non-empty scope requires at least one supporting evidence" };
  }

  // Empty scope with evidence is fine
  if (claim.scope.trim().length === 0) {
    return { isOk: true };
  }

  // Build an index of available evidence by ID
  const evidenceMap = new Map<string, string>();
  for (const ev of evidenceList) {
    evidenceMap.set(ev.evidenceId, ev.scope);
  }

  // Get the scopes of supporting evidence referenced by this claim
  const supportingScopes: string[] = [];
  for (const evidenceId of claim.supportingEvidenceIds) {
    const scope = evidenceMap.get(evidenceId);
    if (scope !== undefined) {
      supportingScopes.push(scope);
    }
  }

  // If no supporting evidence found in the list, cannot validate
  if (supportingScopes.length === 0) {
    return { isOk: false, message: "Supporting evidence not found in provided evidence list" };
  }

  // Check if claim scope is contained within the union of evidence scopes.
  // Strategy: claim scope tokens must all appear in at least one evidence scope.
  // Stop words (and, or, the, etc.) are ignored.
  const stopWords = new Set(["and", "or", "the", "a", "an", "in", "on", "at", "to", "for", "of", "with", "by", "from"]);
  const claimTokens = new Set(
    claim.scope.toLowerCase().split(/\s+/).filter(t => t.length > 0 && !stopWords.has(t)),
  );
  const allEvidenceTokens = new Set<string>();
  for (const scope of supportingScopes) {
    for (const token of scope.toLowerCase().split(/\s+/)) {
      if (token.length > 0) {
        allEvidenceTokens.add(token);
      }
    }
  }

  for (const token of claimTokens) {
    if (!allEvidenceTokens.has(token)) {
      return {
        isOk: false,
        message: `Claim scope token "${token}" not covered by any supporting evidence scope`,
      };
    }
  }

  return { isOk: true };
}
