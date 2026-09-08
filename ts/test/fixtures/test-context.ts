import { InMemoryObjectStore } from "@pf/core/persistence/object-store";
import { InMemoryEventStore } from "@pf/core/persistence/event-store";
import { ResearchController } from "@pf/core/control/controller";
import { TransitionEngine } from "@pf/core/control/engine";
import { ActionRegistry } from "@pf/core/control/registry";
import type { Provider } from "@pf/core/runtime/provider";
import { MockProvider } from "@pf/core/runtime/provider";

export interface TestContext {
  objectStore: InMemoryObjectStore;
  eventStore: InMemoryEventStore;
  controller: ResearchController;
  provider: Provider;
  projectId: string;
  branchId: string;
}

export function createTestContext(options: {
  provider?: Provider;
} = {}): TestContext {
  const objectStore = new InMemoryObjectStore();
  const eventStore = new InMemoryEventStore();
  const transitionEngine = new TransitionEngine();
  const registry = new ActionRegistry();
  const controller = new ResearchController(
    objectStore,
    eventStore,
    transitionEngine,
    registry
  );
  const provider = options.provider ?? new MockProvider();
  return {
    objectStore,
    eventStore,
    controller,
    provider,
    projectId: "00000000-0000-4000-a000-000000000000",
    branchId: "00000000-0000-4000-a000-000000000000",
  };
}
