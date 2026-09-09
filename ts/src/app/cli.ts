import { createApp, loadConfig, AppDependencies } from "./index";
import * as Effect from "effect/Effect";
import { OpenAIProvider } from "@pf/core/runtime/provider";
import { createHypothesis } from "@pf/schema/objects/hypothesis";
import { createHypothesisVerificationWorkflow, runWorkflow } from "@pf/research/hypothesis-verification";
import type { HypothesisVerificationContext } from "@pf/research/hypothesis-verification";

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function initCommand(
  questionText: string,
  app: AppDependencies
): Promise<void> {
  const projectId = generateUuid();
  const questionId = generateUuid();
  const branchId = generateUuid();

  const project = {
    projectId,
    name: questionText,
    description: `Project created from: ${questionText}`,
    status: "ACTIVE" as const,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const question = {
    questionId,
    projectId,
    branchId,
    title: questionText,
    statement: questionText,
    domain: "General",
    status: "DRAFT" as const,
    relatedKnowledgeIds: [],
    parentQuestionId: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await Effect.runPromise(app.objectStore.save(project as Record<string, unknown> & { [key: string]: unknown }));
  await Effect.runPromise(app.objectStore.save(question as Record<string, unknown> & { [key: string]: unknown }));

  console.log("PaperFactory initialized");
  console.log(`  Project: ${project.name}`);
  console.log(`  ProjectId: ${projectId}`);
  console.log(`  QuestionId: ${questionId}`);
  console.log(`  Actions: ${app.actionRegistry.list().length} registered`);
  console.log(`  Tools: ${app.toolRegistry.list().length} registered`);
  console.log(`  Hooks: ${app.hookSystem.list().length} registered`);
}

export async function researchCommand(
  questionText: string,
  app: AppDependencies
): Promise<{ status: string; questionId: string; projectId: string }> {
  const projectId = generateUuid();
  const questionId = generateUuid();
  const branchId = generateUuid();

  const project = {
    projectId,
    name: questionText,
    description: `Research session: ${questionText}`,
    status: "ACTIVE" as const,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const question = {
    questionId,
    projectId,
    branchId,
    title: questionText,
    statement: questionText,
    domain: "General",
    status: "DRAFT" as const,
    relatedKnowledgeIds: [],
    parentQuestionId: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await Effect.runPromise(app.objectStore.save(project as Record<string, unknown> & { [key: string]: unknown }));
  await Effect.runPromise(app.objectStore.save(question as Record<string, unknown> & { [key: string]: unknown }));

  console.log(`Research session started: ${questionText}`);
  console.log(`  ProjectId: ${projectId}`);
  console.log(`  QuestionId: ${questionId}`);

  const config = loadConfig();
  const provider = config.llmApiKey
    ? new OpenAIProvider({
        baseUrl: config.llmBaseUrl,
        apiKey: config.llmApiKey,
        model: config.llmModel,
      })
    : undefined;

  // 先真建 hypothesis（原先传悬空 ID，报告里出现 "Unknown"）
  const hypothesis = createHypothesis({
    hypothesisId: generateUuid(),
    projectId,
    branchId,
    statement: `The research question is answerable with current evidence: ${questionText}`,
    falsificationCondition: "If no credible evidence either way can be found in the literature",
    status: "PROPOSED",
  });
  await Effect.runPromise(app.objectStore.save(hypothesis as unknown as Record<string, unknown> & { [key: string]: unknown }));

  const workflowCtx: HypothesisVerificationContext = {
    hypothesisId: hypothesis.hypothesisId,
    projectId,
    branchId,
    researchQuery: questionText,
    provider,
    objectStore: app.objectStore,
    eventStore: app.eventStore,
    controller: app.controller,
  };

  const phases = createHypothesisVerificationWorkflow(workflowCtx);
  const result = await runWorkflow(phases);

  console.log(`  Workflow status: ${result.status}`);
  console.log(`  Phases completed: ${result.phaseIndex}`);

  const litResult = result.phaseResults.find((r) => r.phase === "literature_search") as
    | { knowledgeItems?: Array<{ summary?: string; sourceIds?: string[] }> }
    | undefined;
  if (litResult?.knowledgeItems?.length) {
    console.log(`\nKnowledge items (${litResult.knowledgeItems.length}):`);
    for (const item of litResult.knowledgeItems) {
      console.log(`  - ${item.summary?.slice(0, 100)}`);
      console.log(`    source: ${item.sourceIds?.[0] ?? "n/a"}`);
    }
  }

  const reportResult = result.phaseResults.find((r) => r.phase === "report_generation") as
    | { report?: { content?: string } }
    | undefined;
  if (reportResult?.report?.content) {
    console.log(`\n=== REPORT ===\n${reportResult.report.content}`);
  }

  return {
    status: result.status,
    questionId,
    projectId,
  };
}

export async function runCLI(
  args: ReadonlyArray<string> = process.argv.slice(2)
): Promise<void> {
  const command = args[0];

  switch (command) {
    case "init": {
      const questionText = args[1];
      const config = loadConfig();
      const app = createApp(config);
      await app.rehydration;

      if (questionText) {
        await initCommand(questionText, app);
      } else {
        console.log("PaperFactory initialized");
        console.log(`  Actions: ${app.actionRegistry.list().length} registered`);
        console.log(`  Tools: ${app.toolRegistry.list().length} registered`);
        console.log(`  Hooks: ${app.hookSystem.list().length} registered`);
        console.log(`  LLM: ${config.llmBaseUrl ? "OpenAI-compatible" : "Mock"}`);
      }
      break;
    }

    case "research": {
      const questionText = args[1];
      if (!questionText) {
        console.error("Usage: paperfactory research \"<research question>\"");
        break;
      }
      const config = loadConfig();
      const app = createApp(config);
      await app.rehydration;
      await researchCommand(questionText, app);
      break;
    }

    case "run": {
      const config = loadConfig();
      if (config.databaseUrl) {
        // REC3: PG 模式运行时自建表（零迁移文件/零 CLI）
        const { ensurePgSchema } = await import("@pf/core/persistence/ensure-pg-schema");
        const tables = await ensurePgSchema();
        console.log(`PG schema ensured: ${tables.length} tables`);
      }
      const app = createApp(config);
      await app.rehydration; // 重放完成才 listen，保证重启后对象在场
      const port = config.port ?? 3000;
      const { createAdaptorServer } = await import("@hono/node-server");
      const server = createAdaptorServer({ fetch: app.honoApp.fetch });

      // Attach WebSocket event broadcaster
      const { EventBroadcaster } = await import("@pf/server/ws/events");
      const broadcaster = new EventBroadcaster();
      broadcaster.attach(server);

      const httpServer = server.listen(port, () => {
        console.log(`PaperFactory server running on port ${port}`);
        console.log(`  UI: http://localhost:${port}/`);
        console.log(`  Health: http://localhost:${port}/health`);
        console.log(`  WebSocket: ws://localhost:${port}/ws`);
      });

      const signalHandlers = () => {
        console.log("\nShutting down...");
        httpServer.close(() => {
          process.exit(0);
        });
        setTimeout(() => process.exit(0), 5000);
      };

      process.on("SIGINT", signalHandlers);
      process.on("SIGTERM", signalHandlers);
      break;
    }

    case "status": {
      const config = loadConfig();
      const app = createApp(config);
      console.log("PaperFactory Status");
      const store = app.objectStore as
        | { store?: Map<string, unknown> }
        | { store?: { size?: number } };
      const evtStore = app.eventStore as { events?: unknown[] };
      const size = typeof store.store?.size === "number" ? store.store.size : "N/A";
      console.log(`  Objects: ${size}`);
      console.log(`  Events: ${evtStore.events ? evtStore.events.length : "N/A"}`);
      console.log(`  Actions: ${app.actionRegistry.list().length}`);
      console.log(`  Tools: ${app.toolRegistry.list().length}`);
      break;
    }

    case "test": {
      const app = createApp();
      console.log("Running smoke tests...");

      const tests: Array<{ name: string; fn: () => boolean }> = [
        {
          name: "Object store",
          fn: () => app.objectStore !== undefined,
        },
        {
          name: "Event store",
          fn: () => app.eventStore !== undefined,
        },
        {
          name: "Controller",
          fn: () => app.controller !== undefined,
        },
        {
          name: "Tools registered",
          fn: () => app.toolRegistry.list().length >= 3,
        },
        {
          name: "Actions registered",
          fn: () => app.actionRegistry.list().length >= 20,
        },
      ];

      let passed = 0;
      for (const test of tests) {
        const ok = test.fn();
        if (ok) passed++;
        console.log(`  ${ok ? "PASS" : "FAIL"}: ${test.name}`);
      }
      console.log(
        `\nResult: ${passed}/${tests.length} tests passed`
      );
      break;
    }

    default:
      console.log("Usage: paperfactory <init|research|run|status|test>");
      console.log('  init "<question>"   - Initialize project with research question');
      console.log('  research "<q>"      - Start research session and run workflow');
      console.log("  run                 - Start the HTTP server");
      console.log("  status              - Show current status");
      console.log("  test                - Run smoke tests");
  }
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("cli.ts")) {
  runCLI().catch(console.error);
}