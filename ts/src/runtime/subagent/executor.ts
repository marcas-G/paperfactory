
import { Provider, Message } from "../provider";
import { ToolRegistry } from "../tools/registry";
import { runAgentLoop } from "../agent/loop";
import { ContextSummarizer, SummarizerContext } from "../agent/summarizer";

export interface SubagentConfig {
  provider: Provider;
  toolRegistry: ToolRegistry;
  systemPrompt: string;
  contextSummarizer?: ContextSummarizer;
  maxIterations?: number;
}

export interface SubagentResult {
  summary: string;
  messages: ReadonlyArray<Message>;
  toolCalls: ReadonlyArray<{ toolName: string; input: Record<string, unknown>; output: Record<string, unknown> }>;
}

export class SubagentExecutor {
  constructor(readonly config: SubagentConfig) {}

  async execute(task: string): Promise<SubagentResult> {
    const messages: Message[] = [
      { role: "system", content: this.config.systemPrompt },
      { role: "user", content: task },
    ];

    const result = await runAgentLoop(
      this.config.provider,
      this.config.toolRegistry,
      messages,
      this.config.maxIterations ?? 10
    );

    let summary = result.finalContent;
    if (this.config.contextSummarizer) {
      const ctx: SummarizerContext = {
        messages: result.messages.map((m) => ({ role: m.role, content: m.content })),
      };
      summary = this.config.contextSummarizer.summarize(ctx).summary;
    }

    return {
      summary,
      messages: result.messages,
      toolCalls: result.toolCalls,
    };
  }
}
