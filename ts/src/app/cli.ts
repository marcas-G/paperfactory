import { createApp, loadConfig, AppDependencies } from "./index";
import * as Effect from "effect/Effect";
import { createHypothesisVerificationWorkflow, runWorkflow } from "@orchestration/hypothesis-verification";
import type { HypothesisVerificationContext } from "@orchestration/hypothesis-verification";

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

  const workflowCtx: HypothesisVerificationContext = {
    hypothesisId: generateUuid(),
    projectId,
    branchId,
    objectStore: app.objectStore,
    eventStore: app.eventStore,
    controller: app.controller,
  };

  const phases = createHypothesisVerificationWorkflow(workflowCtx);
  const result = await runWorkflow(phases);

  console.log(`  Workflow status: ${result.status}`);
  console.log(`  Phases completed: ${result.phaseIndex}`);

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
      await researchCommand(questionText, app);
      break;
    }

    case "run": {
      const config = loadConfig();
      const app = createApp(config);
      const port = config.port ?? 3000;
      const { createAdaptorServer } = await import("@hono/node-server");
      const server = createAdaptorServer({ fetch: app.honoApp.fetch });

      // Attach WebSocket event broadcaster
      const { EventBroadcaster } = await import("@api/ws/events");
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
      console.log(`  Objects: ${store.store ? (store.store as any).size ?? "N/A" : "N/A"}`);
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