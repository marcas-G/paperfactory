import * as Effect from "effect/Effect";
import type { Provider } from "@runtime/provider";

export interface SelfReviewIssue {
  severity: "blocking" | "warning";
  category: "fabrication" | "unfalsifiable" | "bias" | "missing-controls" | "unsupported-claim";
  message: string;
}

export interface SelfReviewResult {
  passed: boolean;
  rounds: number;
  issues: SelfReviewIssue[];
  finalOutput: string;
}

const REVIEW_PROMPT = (phaseName: string, output: string) => `
You are conducting a self-review of research phase output. Use the FALSIFY cognitive mode.

Phase: ${phaseName}
Output to review:
${output.substring(0, 4000)}

Check for:
1. **Fabrication**: Are all citations/URLs/plausible or could they be hallucinated?
2. **Unfalsifiability**: Are hypotheses specific enough to be proven wrong?
3. **Bias**: Is evidence assessment objective or showing confirmation bias?
4. **Missing controls**: Does experiment design include proper controls?
5. **Unsupported claims**: Are conclusions backed by the presented evidence?

Respond with ONLY valid JSON:
{
  "passed": true or false,
  "issues": [{"severity": "blocking|warning", "category": "fabrication|unfalsifiable|bias|missing-controls|unsupported-claim", "message": "description"}],
  "reasoning": "why this judgment"
}
`;

const FIX_PROMPT = (output: string, issues: string) => `
Your phase output had issues:
${issues}

Here is the original output:
${output.substring(0, 4000)}

Please revise the output to fix the blocking issues. Respond with ONLY the revised JSON output (same format as original).
`;

export async function selfReview(
  agentOutput: string,
  phaseName: string,
  provider: Provider,
  maxRounds: number = 3
): Promise<SelfReviewResult> {
  let currentOutput = agentOutput;
  let round = 0;

  while (round < maxRounds) {
    round++;

    const reviewResponse = await Effect.runPromise(
      provider.sendMessages([{ role: "user", content: REVIEW_PROMPT(phaseName, currentOutput) }])
    );

    const reviewData = parseJsonResponse(reviewResponse.content);

    if (!reviewData) {
      return {
        passed: false,
        rounds: round,
        issues: [{
          severity: "warning",
          category: "unsupported-claim",
          message: "Review LLM returned non-JSON response, could not validate output",
        }],
        finalOutput: currentOutput,
      };
    }

    const issues: SelfReviewIssue[] = ((reviewData.issues as Array<{ severity?: string; category?: string; message?: string }>) ?? []).map((i) => ({
      severity: i.severity === "blocking" ? "blocking" : "warning",
      category: (i.category || "unsupported-claim") as SelfReviewIssue["category"],
      message: i.message || "Unknown issue",
    }));

    const blockingIssues = issues.filter((i) => i.severity === "blocking");

    if (blockingIssues.length === 0) {
      return {
        passed: (reviewData.passed as boolean) ?? issues.length === 0,
        rounds: round,
        issues,
        finalOutput: currentOutput,
      };
    }

    // Try to fix
    const fixResponse = await Effect.runPromise(
      provider.sendMessages([{
        role: "user",
        content: FIX_PROMPT(currentOutput, blockingIssues.map((i) => `${i.category}: ${i.message}`).join("\n")),
      }])
    );

    const fixedOutput = fixResponse.content?.trim();
    if (fixedOutput) {
      currentOutput = fixedOutput;
    }
  }

  // Max rounds reached, return with whatever issues remain
  const finalReview = await Effect.runPromise(
    provider.sendMessages([{ role: "user", content: REVIEW_PROMPT(phaseName, currentOutput) }])
  );
  const finalData = parseJsonResponse(finalReview.content);

  return {
    passed: false,
    rounds: round,
    issues: (finalData?.issues as Array<{ severity?: string; category?: string; message?: string }> | undefined)?.map((i) => ({
      severity: i.severity === "blocking" ? "blocking" : "warning",
      category: (i.category || "unsupported-claim") as SelfReviewIssue["category"],
      message: i.message || "Unknown issue",
    })) ?? [],
    finalOutput: currentOutput,
  };
}

function parseJsonResponse(content: string): Record<string, unknown> | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
