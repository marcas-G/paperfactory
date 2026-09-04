import { serve } from "@hono/node-server";
import { createApp, loadConfig } from "./index";

export async function runCLI(
  args: ReadonlyArray<string> = process.argv.slice(2)
): Promise<void> {
  const command = args[0];

  switch (command) {
    case "init": {
      const config = loadConfig();
      const app = createApp(config);
      console.log("PaperFactory initialized");
      console.log(`  Actions: ${app.actionRegistry.list().length} registered`);
      console.log(`  Tools: ${app.toolRegistry.list().length} registered`);
      console.log(`  Hooks: ${app.hookSystem.list().length} registered`);
      console.log(`  LLM: ${config.llmBaseUrl ? "OpenAI-compatible" : "Mock"}`);
      break;
    }

    case "run": {
      const config = loadConfig();
      const app = createApp(config);
      const port = config.port ?? 3000;
      const server = serve({ fetch: app.honoApp.fetch, port }, () => {
        console.log("Server stopped");
      });
      console.log(`PaperFactory server running on port ${port}`);
      console.log(`  Health: http://localhost:${port}/health`);

      const signalHandlers = () => {
        console.log("\nShutting down...");
        server.close(() => {
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
      console.log("Usage: paperfactory <init|run|status|test>");
      console.log("  init   - Initialize and display configuration");
      console.log("  run    - Start the HTTP server");
      console.log("  status - Show current status");
      console.log("  test   - Run smoke tests");
  }
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("cli.ts")) {
  runCLI().catch(console.error);
}
