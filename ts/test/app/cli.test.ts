import { describe, it } from "vitest";
import { runCLI } from "@app/cli";

describe("CLI", () => {
  it("shows usage for unknown command", async () => {
    await runCLI(["unknown-command"]);
  });

  it("init command runs", async () => {
    await runCLI(["init"]);
  });

  it("status command runs", async () => {
    await runCLI(["status"]);
  });

  it("test command runs", async () => {
    await runCLI(["test"]);
  });

  it("empty args shows usage", async () => {
    await runCLI([]);
  });
});
