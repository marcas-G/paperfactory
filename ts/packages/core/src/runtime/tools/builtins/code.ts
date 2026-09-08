import { spawn } from "node:child_process";
import { BaseTool, ToolInput, ToolOutput } from "../contracts";
import * as Effect from "effect/Effect";

export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface CodeToolConfig {
  timeout?: number;
  allowedLanguages?: ReadonlyArray<string>;
  workingDirectory?: string;
}

export function createCodeTool(
  config: CodeToolConfig = {}
): BaseTool {
  const timeout = config.timeout ?? 30_000;
  const allowedLanguages =
    config.allowedLanguages ?? ["python", "javascript", "bash"];
  const workingDirectory = config.workingDirectory ?? process.cwd();

  const executeCode = (
    code: string,
    language: string
  ): Promise<CodeExecutionResult> => {
    return new Promise((resolve) => {
      let command: string;
      let args: string[];
      let timedOut = false;

      switch (language.toLowerCase()) {
        case "python":
          command = "python3";
          args = ["-c", code];
          break;
        case "javascript":
          command = "node";
          args = ["-e", code];
          break;
        case "bash":
          command = "bash";
          args = ["-c", code];
          break;
        default:
          resolve({
            stdout: "",
            stderr: `Unsupported language: ${language}`,
            exitCode: 1,
            timedOut: false,
          });
          return;
      }

      const child = spawn(command, args, {
        cwd: workingDirectory,
        timeout,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        resolve({
          stdout,
          stderr: stderr + `\n${String(err)}`,
          exitCode: 1,
          timedOut: false,
        });
      });

      child.on("close", (code) => {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? 1,
          timedOut,
        });
      });

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGKILL");
        } catch {
          // already dead
        }
        resolve({
          stdout,
          stderr,
          exitCode: 1,
          timedOut: true,
        });
      }, timeout);

      child.on("close", () => {
        clearTimeout(timer);
      });
    });
  };

  const execFn = async (
    input: ToolInput
  ): Promise<ToolOutput> => {
    const code = (input.code as string) ?? "";
    const language = (input.language as string) ?? "javascript";

    if (!allowedLanguages.includes(language.toLowerCase())) {
      return {
        content: JSON.stringify({
          language,
          code,
          stdout: "",
          stderr: `Language not allowed: ${language}`,
          exitCode: 1,
          timedOut: false,
        }),
      };
    }

    try {
      const result = await executeCode(code, language);
      return {
        content: JSON.stringify({
          language,
          code,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
        }),
      };
    } catch (err) {
      return {
        content: JSON.stringify({
          language,
          code,
          stdout: "",
          stderr: String(err),
          exitCode: 1,
          timedOut: false,
        }),
      };
    }
  };

  return {
    name: "code",
    description: "Execute code snippets in various languages",
    execute: (input: ToolInput): Effect.Effect<ToolOutput, string> =>
      Effect.tryPromise({
        try: () => execFn(input),
        catch: (error) => String(error),
      }),
  };
}

export const codeTool: BaseTool = createCodeTool();
