import * as Effect from "effect/Effect";
import type { Provider, Message } from "@runtime/provider";

export interface ConsensusResult {
  answer: string;
  confidence: number;
  paths: string[];
  distribution: Map<string, number>;
}

const defaultSystemPrompt =
  "You are an expert researcher. Provide your independent assessment.";

export async function sampleConsensus(
  question: string,
  provider: Provider,
  options: {
    samples?: number;
    temperature?: number;
    systemPrompt?: string;
    normalizeFn?: (raw: string) => string;
  } = {}
): Promise<ConsensusResult> {
  const {
    samples = 7,
    temperature = 0.7,
    systemPrompt = defaultSystemPrompt,
    normalizeFn,
  } = options;

  const paths: string[] = [];

  for (let i = 0; i < samples; i++) {
    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${question}\n\nProvide your answer concisely.`,
      },
    ];

    const response = await Effect.runPromise(
      provider.sendMessages(messages, { temperature })
    );

    const normalized = normalizeFn
      ? normalizeFn(response.content.trim())
      : response.content.trim().toLowerCase().substring(0, 50);

    paths.push(normalized);
  }

  const distribution = new Map<string, number>();
  for (const path of paths) {
    distribution.set(path, (distribution.get(path) || 0) + 1);
  }

  let maxCount = 0;
  let consensusAnswer = paths[0] || "";
  for (const [answer, count] of distribution) {
    if (count > maxCount) {
      maxCount = count;
      consensusAnswer = answer;
    }
  }

  return {
    answer: consensusAnswer,
    confidence: maxCount / samples,
    paths,
    distribution,
  };
}
