import * as Effect from "effect/Effect";
import { BaseTool } from "@runtime/tools/contracts";

export interface Skill {
  name: string;
  description: string;
  execute: (input: Record<string, unknown>) => Effect.Effect<Record<string, unknown>, string>;
}

export interface Capability {
  name: string;
  description: string;
  skills: ReadonlyArray<Skill>;
  tools: ReadonlyArray<BaseTool>;
  execute: (input: Record<string, unknown>) => Effect.Effect<Record<string, unknown>, string>;
}

export function createCapability(
  name: string,
  description: string,
  skills: ReadonlyArray<Skill>,
  tools: ReadonlyArray<BaseTool>,
  executeFn: (input: Record<string, unknown>) => Effect.Effect<Record<string, unknown>, string>
): Capability {
  return { name, description, skills, tools, execute: executeFn };
}

export function composeCapabilities(
  capabilities: ReadonlyArray<Capability>
): Capability {
  return createCapability(
    `Composite_${capabilities.map((c) => c.name).join("_")}`,
    `Composite of: ${capabilities.map((c) => c.name).join(", ")}`,
    capabilities.flatMap((c) => c.skills),
    capabilities.flatMap((c) => c.tools),
    (input: Record<string, unknown>) => {
      let chain: Effect.Effect<Record<string, unknown>, string> = Effect.succeed({ ...input });
      for (const cap of capabilities) {
        const prev = chain;
        chain = Effect.flatMap(prev, (result) => cap.execute(result));
      }
      return chain;
    }
  );
}
