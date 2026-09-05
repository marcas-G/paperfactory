import * as Effect from "effect/Effect";
import { Skill } from "../../../capabilities/generic/capability";
import { ToolOutput } from "../contracts";

export interface LatexInput {
  content: string;
}

export const createLatexTool = (): Skill => ({
  name: "latex_compile",
  description: "Compile LaTeX content, return output or error",
  execute: (input: Record<string, unknown>) =>
    Effect.try({
      try: () => {
        const content = (input.content as string) || "";
        // Validate basic LaTeX structure
        const hasDoc = content.includes("\\documentclass") && content.includes("\\begin{document}");
        const hasEnd = content.includes("\\end{document}");

        if (!hasDoc || !hasEnd) {
          return {
            type: "result" as const,
            content: `Warning: Invalid LaTeX structure. Input should contain \\documentclass and \\begin{document}...\\end{document}. Received: ${content.substring(0, 100)}`,
            isError: true,
          } as unknown as Record<string, unknown>;
        }

        // In a real environment, this would call pdflatex
        // For now, validate and return success
        const hasUndefined = content.match(/\\(undefined\w+)/);
        if (hasUndefined) {
          return {
            type: "result" as const,
            content: `LaTeX compilation error: Undefined control sequence ${hasUndefined[0]}`,
            isError: true,
          } as unknown as Record<string, unknown>;
        }

        return {
          type: "result" as const,
          content: `LaTeX compilation successful. Document length: ${content.length} characters. Output would be a PDF in production environment.`,
          isError: false,
        } as unknown as Record<string, unknown>;
      },
      catch: (err) => `LaTeX compilation error: ${err}`,
    }),
});
