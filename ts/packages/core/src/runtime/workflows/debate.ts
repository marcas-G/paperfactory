import * as Effect from "effect/Effect";
import type { Provider } from "@pf/core/runtime/provider";

export interface DebateRound {
  round: number;
  pro: string;
  con: string;
  judge: string;
}

export interface DebateResult {
  conclusion: string;
  confidence: number;
  debates: DebateRound[];
}

const PRO_SYSTEM =
  "You are a research advocate. Argue IN FAVOR of the topic based on the evidence. Be thorough and cite specific evidence.";

const CON_SYSTEM =
  "You are a research skeptic. Argue AGAINST the topic. Find flaws, gaps, and alternative explanations. Be rigorous.";

const JUDGE_SYSTEM =
  "You are an impartial research judge. Evaluate both arguments based on evidence quality and logical reasoning. Give a verdict with confidence score (0-1).";

export async function debate(
  topic: string,
  evidence: string[],
  provider: Provider,
  options: { rounds?: number } = {}
): Promise<DebateResult> {
  const { rounds = 3 } = options;
  const debates: DebateRound[] = [];

  for (let r = 1; r <= rounds; r++) {
    const previousContext =
      r > 1
        ? `\nPrevious debate summary: ${debates
            .map((d) => `${d.pro} | ${d.con} | ${d.judge}`)
            .join("; ")}`
        : "";

    const context = `Topic: ${topic}\nEvidence: ${evidence.join("; ")}${previousContext}`;

    const proResponse = await Effect.runPromise(
      provider.sendMessages([
        { role: "system", content: PRO_SYSTEM },
        { role: "user", content: context },
      ])
    );

    const conResponse = await Effect.runPromise(
      provider.sendMessages([
        { role: "system", content: CON_SYSTEM },
        {
          role: "user",
          content: `${context}\nPro argument: ${proResponse.content}`,
        },
      ])
    );

    const judgeResponse = await Effect.runPromise(
      provider.sendMessages([
        { role: "system", content: JUDGE_SYSTEM },
        {
          role: "user",
          content: `${context}\nPro: ${proResponse.content}\nCon: ${conResponse.content}\n\nGive your verdict and confidence score.`,
        },
      ])
    );

    debates.push({
      round: r,
      pro: proResponse.content,
      con: conResponse.content,
      judge: judgeResponse.content,
    });
  }

  const finalJudge = debates[debates.length - 1]?.judge || "";
  const confidence = extractConfidence(finalJudge);

  return {
    conclusion: finalJudge,
    confidence,
    debates,
  };
}

function extractConfidence(text: string): number {
  const colonMatch = text.match(/[Cc]onfidence:\s*(\d+\.?\d*)/i);
  if (colonMatch) {
    return Math.min(Math.max(parseFloat(colonMatch[1]), 0), 1);
  }
  const wordMatch = text.match(/(\d+\.?\d*)\s*confidence/i);
  if (wordMatch) {
    return Math.min(Math.max(parseFloat(wordMatch[1]), 0), 1);
  }
  const percentMatch = text.match(/(\d+\.?\d*)\s*%/);
  if (percentMatch) {
    return Math.min(parseFloat(percentMatch[1]) / 100, 1);
  }
  const slashMatch = text.match(/(\d+\.?\d*)\s*\/10/);
  if (slashMatch) {
    return Math.min(parseFloat(slashMatch[1]) / 10, 1);
  }
  return 0.5;
}
