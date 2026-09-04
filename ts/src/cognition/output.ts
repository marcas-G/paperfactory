import * as Schema from "@effect/schema/Schema";

const HypothesisOutputSchema = Schema.Struct({
  statement: Schema.NonEmptyString,
  falsificationCondition: Schema.String.pipe(
    Schema.filter(
      (s) => s.trim().length > 0,
      { message: () => "falsificationCondition must not be empty or whitespace-only" },
    ),
  ),
});

const EvidenceOutputSchema = Schema.Struct({
  summary: Schema.NonEmptyString,
  direction: Schema.Enums({
    SUPPORTING: "SUPPORTING",
    CONFLICTING: "CONFLICTING",
    NEUTRAL: "NEUTRAL",
  }),
  strength: Schema.Number.pipe(Schema.between(0, 1)),
});

const ExperimentOutputSchema = Schema.Struct({
  description: Schema.NonEmptyString,
  steps: Schema.Array(Schema.NonEmptyString),
});

export interface ValidationResult {
  _tag: "Ok";
  data: Record<string, unknown>;
}

export interface ValidationFailure {
  _tag: "Fail";
  errors: string[];
}

export type ValidationOutput = ValidationResult | ValidationFailure;

const ACTION_VALIDATORS: Record<string, (input: unknown) => unknown> = {
  PROPOSE_HYPOTHESIS: Schema.decodeUnknownSync(HypothesisOutputSchema),
  ASSESS_HYPOTHESIS: Schema.decodeUnknownSync(HypothesisOutputSchema),
  PROPOSE_EVIDENCE: Schema.decodeUnknownSync(EvidenceOutputSchema),
  DESIGN_STUDY: Schema.decodeUnknownSync(ExperimentOutputSchema),
  CREATE_PROTOCOL: Schema.decodeUnknownSync(ExperimentOutputSchema),
};

export const OutputValidator = {
  validate(action: string, output: Record<string, unknown>): ValidationOutput {
    const validate = ACTION_VALIDATORS[action];
    if (!validate) {
      return {
        _tag: "Fail",
        errors: [`Unknown action type: ${action}`],
      };
    }

    try {
      const data = validate(output) as Record<string, unknown>;
      return { _tag: "Ok", data };
    } catch (e) {
      const errors = e instanceof Error ? [e.message] : ["Validation failed"];
      return { _tag: "Fail", errors };
    }
  },
};
