import * as Effect from "effect/Effect";
import type { Provider } from "@runtime/provider";

export interface ThoughtNode {
  thought: string;
  score: { feasibility: number; novelty: number; relevance: number };
  children: ThoughtNode[];
  parent?: ThoughtNode;
}

export interface BeamSearchResult {
  bestPath: ThoughtNode[];
  exploredCount: number;
  bestScore: { feasibility: number; novelty: number; relevance: number };
}

const avgScore = (s: ThoughtNode["score"]): number =>
  (s.feasibility + s.novelty + s.relevance) / 3;

const zeroScore = (): ThoughtNode["score"] => ({
  feasibility: 0,
  novelty: 0,
  relevance: 0,
});

const fallbackScore = (): ThoughtNode["score"] => ({
  feasibility: 5,
  novelty: 5,
  relevance: 5,
});

function generateThoughtPrompt(context: string, beamWidth: number): string {
  return `Generate ${beamWidth} distinct candidate thoughts for: ${context}\nEach thought should be a unique approach.\nSeparate thoughts with "---"\n`;
}

function evaluateThoughtsPrompt(thoughts: string[]): string {
  return `Evaluate each thought on feasibility(1-10), novelty(1-10), relevance(1-10):\n${thoughts.map((t, i) => `${i + 1}: ${t}`).join("\n")}\nReturn JSON: [{"feasibility": N, "novelty": N, "relevance": N}]`;
}

function parseScores(
  jsonStr: string,
  count: number
): Array<ThoughtNode["score"]> {
  try {
    const match = jsonStr.match(/\[[\s\S]*\]/);
    if (!match) return Array.from({ length: count }, fallbackScore);
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return Array.from({ length: count }, fallbackScore);
    const scores: Array<ThoughtNode["score"]> = [];
    for (let i = 0; i < count; i++) {
      const entry = parsed[i];
      if (
        entry &&
        typeof entry.feasibility === "number" &&
        typeof entry.novelty === "number" &&
        typeof entry.relevance === "number"
      ) {
        scores.push(entry);
      } else {
        scores.push(fallbackScore());
      }
    }
    while (scores.length < count) {
      scores.push(fallbackScore());
    }
    return scores;
  } catch {
    return Array.from({ length: count }, fallbackScore);
  }
}

function tracePath(node: ThoughtNode): ThoughtNode[] {
  const path: ThoughtNode[] = [];
  let current: ThoughtNode | undefined = node;
  while (current) {
    path.unshift(current);
    current = current.parent;
  }
  return path;
}

export async function beamSearch(
  question: string,
  provider: Provider,
  options: {
    beamWidth?: number;
    depth?: number;
    systemPrompt?: string;
  } = {}
): Promise<BeamSearchResult> {
  const { beamWidth = 3, depth = 3, systemPrompt } = options;

  let exploredCount = 0;
  const root: ThoughtNode = {
    thought: question,
    score: fallbackScore(),
    children: [],
  };
  let currentNodes: ThoughtNode[] = [root];

  for (let d = 0; d < depth; d++) {
    if (currentNodes.length === 0) break;

    const allChildren: ThoughtNode[] = [];

    for (const node of currentNodes) {
      const genResponse = await Effect.runPromise(
        provider.sendMessages([
          {
            role: "system",
            content:
              systemPrompt ??
              "You are an expert researcher exploring multiple solution paths.",
          },
          { role: "user", content: generateThoughtPrompt(node.thought, beamWidth) },
        ])
      );

      const thoughts = genResponse.content.split("---").map((t) => t.trim()).filter(Boolean);

      if (thoughts.length === 0) continue;

      exploredCount += thoughts.length;

      const evalResponse = await Effect.runPromise(
        provider.sendMessages([
          {
            role: "system",
            content: "You evaluate research approaches objectively.",
          },
          { role: "user", content: evaluateThoughtsPrompt(thoughts) },
        ])
      );

      const scores = parseScores(evalResponse.content, thoughts.length);

      for (let i = 0; i < thoughts.length; i++) {
        allChildren.push({
          thought: thoughts[i],
          score: scores[i] ?? fallbackScore(),
          children: [],
          parent: node,
        });
      }
    }

    if (allChildren.length === 0) break;

    allChildren.sort((a, b) => avgScore(b.score) - avgScore(a.score));
    currentNodes = allChildren.slice(0, beamWidth);

    for (const child of currentNodes) {
      if (child.parent) {
        child.parent.children.push(child);
      }
    }
  }

  if (exploredCount === 0) {
    return {
      bestPath: [root],
      exploredCount: 0,
      bestScore: zeroScore(),
    };
  }

  const bestNode = currentNodes[0];
  const bestPath = tracePath(bestNode);

  return {
    bestPath,
    exploredCount,
    bestScore: bestNode.score,
  };
}
