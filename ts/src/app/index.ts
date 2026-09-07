import { InMemoryObjectStore, ObjectStore } from "@persistence/object-store";
import { InMemoryEventStore, EventStore } from "@persistence/event-store";
import { PgObjectStore } from "@persistence/pg-object-store";
import { PgEventStore } from "@persistence/pg-event-store";
import { getDb } from "@persistence/drizzle/db";
import { ResearchController } from "@control/controller";
import { TransitionEngine } from "@control/engine";
import { ActionRegistry } from "@control/registry";
import { ToolRegistry } from "@runtime/tools/registry";
import { NoOpTracer } from "@observability/tracer";
import { InMemoryMetrics } from "@observability/metrics";
import { DefaultEvalFramework } from "@evals/framework";
import { HookSystem } from "@runtime/hooks/system";
import { searchTool } from "@runtime/tools/builtins/search";
import { codeTool } from "@runtime/tools/builtins/code";
import {
  InMemoryFilesystem,
  createFilesystemTool,
} from "@runtime/tools/builtins/filesystem";
import { OpenAIProvider } from "@runtime/provider";
import { createHonoApp, HonoApp } from "@api/routes";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export interface AppDependencies {
  objectStore: ObjectStore;
  eventStore: EventStore;
  controller: ResearchController;
  transitionEngine: TransitionEngine;
  actionRegistry: ActionRegistry;
  toolRegistry: ToolRegistry;
  tracer: NoOpTracer;
  metrics: InMemoryMetrics;
  evalFramework: DefaultEvalFramework;
  hookSystem: HookSystem;
  honoApp: HonoApp;
}

export interface AppConfig {
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
  sandboxBaseDir?: string;
  port?: number;
  databaseUrl?: string;
}

export function loadConfig(): AppConfig {
  return {
    llmBaseUrl: process.env.LLM_BASE_URL,
    llmApiKey: process.env.LLM_API_KEY,
    llmModel: process.env.LLM_MODEL,
    sandboxBaseDir: process.env.SANDBOX_BASE_DIR ?? "/tmp/paperfactory",
    port: parseInt(process.env.PORT ?? "3000", 10),
    databaseUrl: process.env.DATABASE_URL,
  };
}

export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  const database = getDb();
  await migrate(database, { migrationsFolder: "./drizzle" });
}

export function createApp(
  config: AppConfig = loadConfig()
): AppDependencies {
  const usePg = !!config.databaseUrl;

  let objectStore: ObjectStore;
  let eventStore: EventStore;

  if (usePg) {
    objectStore = new PgObjectStore();
    eventStore = new PgEventStore();
  } else {
    objectStore = new InMemoryObjectStore();
    eventStore = new InMemoryEventStore();
  }

  const transitionEngine = new TransitionEngine();
  const actionRegistry = new ActionRegistry();
  const controller = new ResearchController(
    objectStore,
    eventStore,
    transitionEngine,
    actionRegistry
  );

  const toolRegistry = new ToolRegistry();
  const fs = new InMemoryFilesystem();

  toolRegistry.register(searchTool, {
    name: "search",
    description: "Search for papers",
    schema: {},
    writeOnly: false,
  });
  toolRegistry.register(codeTool, {
    name: "code",
    description: "Execute code",
    schema: {},
    writeOnly: false,
  });
  toolRegistry.register(createFilesystemTool(fs), {
    name: "filesystem",
    description: "Filesystem operations",
    schema: {},
    writeOnly: true,
  });

  const tracer = new NoOpTracer();
  const metrics = new InMemoryMetrics();
  const evalFramework = new DefaultEvalFramework();
  const hookSystem = new HookSystem();

  const provider = new OpenAIProvider({
    baseUrl: config.llmBaseUrl ?? "http://localhost:8011/v1",
    apiKey: config.llmApiKey ?? "not-needed",
    model: config.llmModel ?? "qwen2.5-7b-instruct",
  });

  const honoApp = createHonoApp(
    {} as any,
    objectStore,
    controller,
    provider,
    toolRegistry
  );

  return {
    objectStore,
    eventStore,
    controller,
    transitionEngine,
    actionRegistry,
    toolRegistry,
    tracer,
    metrics,
    evalFramework,
    hookSystem,
    honoApp,
  };
}
