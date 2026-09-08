import * as Schema from "@effect/schema/Schema";
import { CognitiveMode } from "@pf/schema/enums";

export interface ActionDefinition {
  name: string;
  targetType: string;
  allowedSourceStates: ReadonlyArray<string>;
  targetState: string;
  requiresGate: boolean;
  cognitiveMode: Schema.Schema.Type<typeof CognitiveMode>;
}

export const ALL_ACTIONS: ReadonlyArray<ActionDefinition> = [
  // Question actions
  { name: "scope_question", targetType: "ResearchQuestion", allowedSourceStates: ["DRAFT"], targetState: "SCOPED", requiresGate: false, cognitiveMode: "FRAME" },
  { name: "activate_question", targetType: "ResearchQuestion", allowedSourceStates: ["DRAFT", "SCOPED"], targetState: "ACTIVE", requiresGate: true, cognitiveMode: "DECIDE" },
  { name: "archive_question", targetType: "ResearchQuestion", allowedSourceStates: ["ACTIVE", "SCOPED"], targetState: "ARCHIVED", requiresGate: false, cognitiveMode: "DECIDE" },

  // Knowledge actions
  { name: "assess_knowledge", targetType: "KnowledgeItem", allowedSourceStates: ["DRAFT"], targetState: "ASSESSED", requiresGate: true, cognitiveMode: "VERIFY" },
  { name: "validate_knowledge", targetType: "KnowledgeItem", allowedSourceStates: ["ASSESSED"], targetState: "VALIDATED", requiresGate: true, cognitiveMode: "VERIFY" },
  { name: "supersede_knowledge", targetType: "KnowledgeItem", allowedSourceStates: ["VALIDATED", "ASSESSED"], targetState: "SUPERSEDED", requiresGate: true, cognitiveMode: "COMPARE" },

  // Gap actions
  { name: "validate_gap", targetType: "ResearchGap", allowedSourceStates: ["IDENTIFIED"], targetState: "VALIDATED", requiresGate: true, cognitiveMode: "MAP" },
  { name: "address_gap", targetType: "ResearchGap", allowedSourceStates: ["VALIDATED"], targetState: "ADDRESSED", requiresGate: true, cognitiveMode: "DIAGNOSE" },
  { name: "close_gap", targetType: "ResearchGap", allowedSourceStates: ["ADDRESSED"], targetState: "CLOSED", requiresGate: false, cognitiveMode: "DECIDE" },

  // Hypothesis actions
  { name: "assess_hypothesis", targetType: "Hypothesis", allowedSourceStates: ["PROPOSED"], targetState: "ASSESSED", requiresGate: true, cognitiveMode: "COMPARE" },
  { name: "activate_hypothesis", targetType: "Hypothesis", allowedSourceStates: ["ASSESSED"], targetState: "ACTIVE", requiresGate: true, cognitiveMode: "DECIDE" },
  { name: "confirm_hypothesis", targetType: "Hypothesis", allowedSourceStates: ["ACTIVE"], targetState: "CONFIRMED", requiresGate: true, cognitiveMode: "VERIFY" },
  { name: "reject_hypothesis", targetType: "Hypothesis", allowedSourceStates: ["ACTIVE"], targetState: "REJECTED", requiresGate: true, cognitiveMode: "FALSIFY" },

  // Protocol actions
  { name: "review_protocol", targetType: "Protocol", allowedSourceStates: ["DRAFT"], targetState: "REVIEWED", requiresGate: true, cognitiveMode: "VERIFY" },
  { name: "freeze_protocol", targetType: "Protocol", allowedSourceStates: ["REVIEWED"], targetState: "FROZEN", requiresGate: true, cognitiveMode: "DECIDE" },
  { name: "supersede_protocol", targetType: "Protocol", allowedSourceStates: ["FROZEN"], targetState: "SUPERSEDED", requiresGate: true, cognitiveMode: "DIAGNOSE" },

  // Experiment actions
  { name: "start_experiment", targetType: "Experiment", allowedSourceStates: ["PLANNED"], targetState: "RUNNING", requiresGate: true, cognitiveMode: "EXPLORE" },
  { name: "complete_experiment", targetType: "Experiment", allowedSourceStates: ["RUNNING"], targetState: "COMPLETED", requiresGate: false, cognitiveMode: "MAP" },
  { name: "fail_experiment", targetType: "Experiment", allowedSourceStates: ["RUNNING"], targetState: "FAILED", requiresGate: false, cognitiveMode: "DIAGNOSE" },
  { name: "cancel_experiment", targetType: "Experiment", allowedSourceStates: ["PLANNED", "RUNNING"], targetState: "CANCELLED", requiresGate: false, cognitiveMode: "DECIDE" },

  // Result actions
  { name: "validate_result", targetType: "Result", allowedSourceStates: ["RAW"], targetState: "VALIDATED", requiresGate: true, cognitiveMode: "VERIFY" },
  { name: "invalidate_result", targetType: "Result", allowedSourceStates: ["RAW", "VALIDATED"], targetState: "INVALIDATED", requiresGate: true, cognitiveMode: "FALSIFY" },

  // Claim actions
  { name: "validate_claim", targetType: "Claim", allowedSourceStates: ["PROPOSED"], targetState: "VALIDATED", requiresGate: true, cognitiveMode: "VERIFY" },
  { name: "retract_claim", targetType: "Claim", allowedSourceStates: ["PROPOSED", "VALIDATED"], targetState: "RETRACTED", requiresGate: true, cognitiveMode: "FALSIFY" },
];

export const getActionByName = (name: string): ActionDefinition | undefined =>
  ALL_ACTIONS.find((a) => a.name === name);

export const getActionsByTarget = (targetType: string): ReadonlyArray<ActionDefinition> =>
  ALL_ACTIONS.filter((a) => a.targetType === targetType);
