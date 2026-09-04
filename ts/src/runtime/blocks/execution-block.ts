import * as Schema from "@effect/schema/Schema";
import { BlockStepType } from "@domain/enums";
import * as Effect from "effect/Effect";

export interface BlockStep {
  type: Schema.Schema.Type<typeof BlockStepType>;
  name: string;
  execute: (context: BlockContext) => Effect.Effect<BlockContext, string>;
}

export interface BlockContext {
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ExecutionBlock {
  name: string;
  description: string;
  steps: ReadonlyArray<BlockStep>;
  entryPoint: (input: Record<string, unknown>) => Effect.Effect<BlockContext, string>;
  successCondition: (context: BlockContext) => boolean;
  failureHandler: (error: string, context: BlockContext) => Effect.Effect<BlockContext, never>;
}

export function createExecutionBlock(
  name: string,
  description: string,
  steps: ReadonlyArray<BlockStep>,
  entryPoint: (input: Record<string, unknown>) => Effect.Effect<BlockContext, string>,
  successCondition: (context: BlockContext) => boolean,
  failureHandler: (error: string, context: BlockContext) => Effect.Effect<BlockContext, never>
): ExecutionBlock {
  return { name, description, steps, entryPoint, successCondition, failureHandler };
}
