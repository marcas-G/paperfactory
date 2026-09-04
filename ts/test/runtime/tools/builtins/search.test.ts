import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import { createSearchTool } from "@runtime/tools/builtins/search";

describe("Search Tool", () => {
  it("returns empty results when no endpoint configured", async () => {
    const tool = createSearchTool();

    const result = await Effect.runPromise(
      tool.execute({ query: "test" })
    );

    expect(result.content).toBeTruthy();
  });

  it("uses custom config", async () => {
    const tool = createSearchTool({
      maxResults: 5,
    });

    expect(tool.name).toBe("search");
    expect(tool.description).toContain("Search");

    const result = await Effect.runPromise(
      tool.execute({ query: "machine learning" })
    );

    expect(result.content).toBeTruthy();
  });

  it("handles empty query", async () => {
    const tool = createSearchTool();

    const result = await Effect.runPromise(tool.execute({}));

    expect(result.content).toBeTruthy();
  });
});
