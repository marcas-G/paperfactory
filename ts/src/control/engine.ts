import * as Effect from "effect/Effect";

import { GateResult } from "./gates";
import { getActionByName } from "./actions";

export interface TransitionRequest {
  actionName: string;
  currentObjectState: Record<string, unknown>;
  gateResults?: ReadonlyArray<GateResult>;
}

export interface TransitionResult {
  success: boolean;
  newState: Record<string, unknown> | null;
  errorMessage?: string;
}

export class TransitionEngine {
  validateTransition(request: TransitionRequest): Effect.Effect<TransitionResult, never> {
    const action = getActionByName(request.actionName);
    if (!action) {
      return Effect.succeed({
        success: false,
        newState: null,
        errorMessage: `Unknown action: ${request.actionName}`,
      });
    }

    const currentState = request.currentObjectState.status as string;
    if (!action.allowedSourceStates.includes(currentState)) {
      return Effect.succeed({
        success: false,
        newState: null,
        errorMessage: `Cannot perform ${request.actionName} from state ${currentState}. Allowed: ${action.allowedSourceStates.join(", ")}`,
      });
    }

    if (action.requiresGate && request.gateResults) {
      const failingGate = request.gateResults.find(
        (r) => r.status === "FAIL" || r.status === "BLOCKED"
      );
      if (failingGate) {
        return Effect.succeed({
          success: false,
          newState: null,
          errorMessage: `Gate ${failingGate.name} result: ${failingGate.status}. ${failingGate.reason}`,
        });
      }
    }

    return Effect.succeed({
      success: true,
      newState: {
        ...request.currentObjectState,
        status: action.targetState,
        updatedAt: new Date(),
      },
    });
  }
}
