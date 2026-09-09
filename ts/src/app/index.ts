import { InMemoryObjectStore, ObjectStore } from "@pf/core/persistence/object-store";
import { ProjectingObjectStore, replayObjectsInto } from "@pf/core/persistence/projecting-store";
import { InMemoryEventStore, EventStore } from "@pf/core/persistence/event-store";
import { PgObjectStore } from "@pf/core/persistence/pg-object-store";
import { PgEventStore } from "@pf/core/persistence/pg-event-store";
import { getDb } from "@pf/core/persistence/drizzle/db";
import { ResearchController } from "@pf/core/control/controller";
import { TransitionEngine } from "@pf/core/control/engine";
import { ActionRegistry } from "@pf/core/control/registry";
import { ToolRegistry } from "@pf/core/runtime/tools/registry";
import { NoOpTracer } from "@pf/core/observability/tracer";
import { InMemoryMetrics } from "@pf/core/observability/metrics";
import { DefaultEvalFramework } from "@pf/core/evals/framework";
import { HookSystem } from "@pf/core/runtime/hooks/system";
import { searchTool } from "@pf/core/runtime/tools/builtins/search";
import { codeTool } from "@pf/core/runtime/tools/builtins/code";
import { literatureSearchTool } from "@pf/core/runtime/tools/builtins/literature";
import {
  InMemoryFilesystem,
  createFilesystemTool,
} from "@pf/core/runtime/tools/builtins/filesystem";
import { OpenAIProvider } from "@pf/core/runtime/provider";
import { createHonoApp, HonoApp } from "@pf/server/routes";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export interface AppDependencies {
  objectStore: ObjectStore;
  /** 内存模式：启动时从事件账本重放对象的 Promise（PG/vitest 为立即完成）。 */
  rehydration: Promise<number>;
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
  let rehydration: Promise<number> = Promise.resolve(0); // PG 模式无重放，立即完成

  if (usePg) {
    objectStore = new PgObjectStore();
    eventStore = new PgEventStore();
  } else {
    eventStore = new InMemoryEventStore();
    // REQ-REC2：wrap + 启动重放（重放到裸 store，绕过投影层防镜像）
    const bare = new InMemoryObjectStore();
    objectStore = new ProjectingObjectStore(bare);
    rehydration = replayObjectsInto(bare);
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
    schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query for academic papers" },
      },
      required: ["query"],
    },
    writeOnly: false,
  });
  toolRegistry.register(codeTool, {
    name: "code",
    description: "Execute code",
    schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "The source code to execute" },
        language: { type: "string", enum: ["python", "javascript"], description: "Execution language" },
      },
      required: ["code", "language"],
    },
    writeOnly: false,
  });
  toolRegistry.register(createFilesystemTool(fs), {
    name: "filesystem",
    description: "Filesystem operations",
    schema: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["read", "write", "list", "delete"], description: "The operation to perform" },
        path: { type: "string", description: "Target file path" },
        content: { type: "string", description: "Content to write (write only)" },
      },
      required: ["operation", "path"],
    },
    writeOnly: true,
  });
  toolRegistry.register(literatureSearchTool, {
    name: "literature_search",
    description:
      "Search real academic papers on arXiv (with Semantic Scholar as first choice). " +
      "Returns structured results with real, citable sources (titles, authors, abstracts, URLs).",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Academic search query, 3-6 core concept words" },
        maxResults: { type: "number", description: "Max papers to return (1-10, default 5)" },
      },
      required: ["query"],
    },
    writeOnly: false,
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
    objectStore,
    controller,
    provider,
    toolRegistry
  );

  return {
    objectStore,
    rehydration,
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
