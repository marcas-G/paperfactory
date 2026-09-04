import { ActionDefinition } from "./actions";

export interface PolicyScore {
  action: ActionDefinition;
  priority: number;
  risk: number;
  progress: number;
  total: number;
}

const WEIGHTS = {
  priority: 0.4,
  risk: 0.3,
  progress: 0.3,
};

export function scoreCandidates(
  candidates: ReadonlyArray<ActionDefinition>,
  currentState: string
): ReadonlyArray<PolicyScore> {
  return candidates
    .filter((a) => a.allowedSourceStates.includes(currentState))
    .map((action) => {
      const priority = action.requiresGate ? 0.8 : 0.5;
      const risk = action.targetState === "FROZEN" || action.targetState === "REJECTED" ? 0.7 : 0.3;
      const progress = action.targetState === "VALIDATED" || action.targetState === "CONFIRMED" || action.targetState === "COMPLETED" ? 0.9 : 0.5;
      const total =
        priority * WEIGHTS.priority +
        risk * WEIGHTS.risk +
        progress * WEIGHTS.progress;

      return { action, priority, risk, progress, total: Math.round(total * 100) / 100 };
    })
    .sort((a, b) => b.total - a.total);
}
