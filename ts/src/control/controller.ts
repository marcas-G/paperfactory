import * as Effect from "effect/Effect";
import { ObjectStore } from "@persistence/object-store";
import { DomainEvent, createDomainEvent } from "@domain/events";
import { EventStore } from "@persistence/event-store";
import { ActionRegistry } from "./registry";
import { TransitionEngine } from "./engine";
import { getActionByName, getActionsByTarget, type ActionDefinition } from "./actions";
import { ALL_GATES, type GateResult } from "./gates";
import { scoreCandidates, type PolicyScore } from "./policy";

export interface ControllerRequest {
  actionName: string;
  objectId: string;
  objectType: string;
}

export interface ControllerResult {
  success: boolean;
  action: ActionDefinition | null;
  gateResults: ReadonlyArray<GateResult>;
  scores: ReadonlyArray<PolicyScore>;
  errorMessage?: string;
  event?: DomainEvent;
}

export class ResearchController {
  constructor(
    readonly objectStore: ObjectStore,
    readonly eventStore: EventStore,
    readonly transitionEngine: TransitionEngine = new TransitionEngine(),
    readonly registry: ActionRegistry = new ActionRegistry(),
  ) {}

  async execute(request: ControllerRequest): Promise<ControllerResult> {
    const action = getActionByName(request.actionName);
    if (!action) {
      return {
        success: false,
        action: null,
        gateResults: [],
        scores: [],
        errorMessage: `Unknown action: ${request.actionName}`,
      };
    }

    const opt = await Effect.runPromise(
      this.objectStore.get(request.objectId, request.objectType),
    );
    if (opt.isNone()) {
      return {
        success: false,
        action: null,
        gateResults: [],
        scores: [],
        errorMessage: `Object not found: ${request.objectId}`,
      };
    }

    const obj = opt.value!;

    const candidates = getActionsByTarget(request.objectType);
    const scores = scoreCandidates(candidates, (obj as Record<string, unknown>).status as string);

    const gateResults: GateResult[] = [];
    if (action.requiresGate) {
      for (const gate of ALL_GATES) {
        const result = await Effect.runPromise(
          gate.evaluate({
            objectState: obj as Record<string, unknown>,
            actionName: request.actionName,
          }),
        );
        gateResults.push({ ...result, name: gate.name });
      }
    }

    const blocking = gateResults.find((r) => r.status === "BLOCKED" || r.status === "FAIL");
    if (blocking) {
      return {
        success: false,
        action,
        gateResults,
        scores,
        errorMessage: `Blocked by gate ${blocking.name}: ${blocking.reason}`,
      };
    }

    const transitionResult = await Effect.runPromise(
      this.transitionEngine.validateTransition({
        actionName: request.actionName,
        currentObjectState: obj as Record<string, unknown>,
        gateResults,
      }),
    );

    if (!transitionResult.success) {
      return {
        success: false,
        action,
        gateResults,
        scores,
        errorMessage: transitionResult.errorMessage,
      };
    }

    const newState = transitionResult.newState;
    if (newState) {
      await Effect.runPromise(this.objectStore.save(newState));
    }

    const event = createDomainEvent({
      type: "STATE_TRANSITION",
      objectId: request.objectId,
      payload: { action: request.actionName, newState: action.targetState },
    });
    await Effect.runPromise(this.eventStore.append(event));

    return {
      success: true,
      action,
      gateResults,
      scores,
      event,
    };
  }
}