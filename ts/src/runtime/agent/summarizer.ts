export interface SummarizerContext {
  messages: ReadonlyArray<Record<string, unknown>>;
}

export interface SummaryResult {
  summary: string;
  tokensUsed: number;
}

export interface ContextSummarizer {
  summarize(context: SummarizerContext): SummaryResult;
}

export class MockSummarizer implements ContextSummarizer {
  constructor(readonly maxSummaryLength = 500) {}

  summarize(context: SummarizerContext): SummaryResult {
    const text = context.messages
      .map((m) => String(m.content))
      .join(" ");
    const summary = text.length > this.maxSummaryLength
      ? text.substring(0, this.maxSummaryLength) + "..."
      : text;
    return {
      summary,
      tokensUsed: Math.ceil(summary.length / 4),
    };
  }
}
