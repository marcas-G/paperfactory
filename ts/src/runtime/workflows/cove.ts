import * as Effect from "effect/Effect";
import type { Provider } from "@runtime/provider";
import type { ToolRegistry } from "@runtime/tools/registry";

export interface VerificationIssue {
  claim: string;
  status: "VERIFIED" | "NOT_VERIFIED" | "CONTRADICTED" | "VERIFIED_BY_SEARCH" | "UNVERIFIED_IMPORTANT" | "REMOVED_UNIMPORTANT";
  reason: string;
}

export interface CoVeResult {
  revisedOutput: string | null;
  issues: VerificationIssue[];
}

const CLAIM_EXTRACTION_PROMPT = `Extract every factual claim from this research output. A factual claim is any statement that can be independently verified (e.g., specific numbers, study results, causation claims, specific findings).

Return ONLY a valid JSON array of strings. Example:
["Claim 1", "Claim 2", "Claim 3"]

Do NOT include meta-statements like "I think" or "in this report". Only extract concrete factual claims.`;

const CLAIM_VERIFICATION_PROMPT = (claim: string, phaseName: string, context: string) => `
Verify this factual claim from a research ${phaseName} phase.

Claim: ${claim}

Available context from the phase:
${context.substring(0, 2000)}

Respond with ONLY valid JSON:
{
  "status": "VERIFIED" | "NOT_VERIFIED" | "CONTRADICTED",
  "reason": "Explain why you reached this judgment",
  "important": true or false
}

Rules:
- VERIFIED: The claim is directly supported by the available evidence
- CONTRADICTED: The available evidence contradicts the claim
- NOT_VERIFIED: The claim cannot be verified from available evidence (but is not contradicted)
- important: true if this claim significantly impacts the research conclusions`;

const SEARCH_VERIFICATION_PROMPT = (claim: string, searchResult: string) => `
A factual claim could not be verified from local context. A search was performed and returned:

Claim: ${claim}
Search results: ${searchResult.substring(0, 1500)}

Respond with ONLY valid JSON:
{
  "verified": true or false,
  "reason": "Explain verification result"
}`;

function parseClaims(content: string): string[] {
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c: any) => typeof c === "string" && c.trim().length > 0);
  } catch {
    return [];
  }
}

function parseVerification(content: string): { status: string; reason: string; important: boolean } {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    return { status: "NOT_VERIFIED", reason: "Could not parse verification response", important: true };
  }
  try {
    const parsed = JSON.parse(match[0]);
    return {
      status: parsed.status ?? "NOT_VERIFIED",
      reason: parsed.reason ?? "No reason provided",
      important: parsed.important ?? true,
    };
  } catch {
    return { status: "NOT_VERIFIED", reason: "Could not parse verification response", important: true };
  }
}

async function searchVerify(
  claim: string,
  toolRegistry: ToolRegistry,
  provider: Provider
): Promise<{ verified: boolean; reason: string }> {
  if (toolRegistry.has("search")) {
    try {
      const searchEffect = toolRegistry.execute("search", { query: claim, maxResults: 5 });
      const searchResult = await Effect.runPromise(searchEffect);
      const searchOutput = typeof searchResult.content === "string"
        ? searchResult.content
        : JSON.stringify(searchResult);

      const verifyResponse = await Effect.runPromise(
        provider.sendMessages([
          { role: "system", content: "You verify factual claims against search results." },
          { role: "user", content: SEARCH_VERIFICATION_PROMPT(claim, searchOutput) },
        ])
      );

      const match = verifyResponse.content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          return {
            verified: parsed.verified ?? false,
            reason: parsed.reason ?? "Search-based verification",
          };
        } catch { /* fallthrough */ }
      }
    } catch { /* search failed, fallthrough */ }
  }

  return { verified: false, reason: "Search unavailable or failed" };
}

export async function chainOfVerification(
  output: string,
  phaseName: string,
  provider: Provider,
  context: string = "",
  toolRegistry?: ToolRegistry
): Promise<CoVeResult> {
  // Step 1: Extract claims
  const extractResponse = await Effect.runPromise(
    provider.sendMessages([
      { role: "system", content: CLAIM_EXTRACTION_PROMPT },
      { role: "user", content: output },
    ])
  );

  const claims = parseClaims(extractResponse.content);

  if (claims.length === 0) {
    return { revisedOutput: null, issues: [] };
  }

  const issues: VerificationIssue[] = [];
  let revised = output;

  // Step 2: Verify each claim
  for (const claim of claims) {
    const verifyResponse = await Effect.runPromise(
      provider.sendMessages([
        { role: "system", content: "You verify factual claims objectively." },
        { role: "user", content: CLAIM_VERIFICATION_PROMPT(claim, phaseName, context) },
      ])
    );

    const verification = parseVerification(verifyResponse.content);

    if (verification.status === "CONTRADICTED") {
      issues.push({ claim, status: "CONTRADICTED", reason: verification.reason });
      revised = revised.replace(claim, `[CONTRADICTED: ${claim}]`);
    } else if (verification.status === "NOT_VERIFIED" && verification.important) {
      if (toolRegistry && toolRegistry.has("search")) {
        const searchResult = await searchVerify(claim, toolRegistry, provider);
        if (searchResult.verified) {
          issues.push({ claim, status: "VERIFIED_BY_SEARCH", reason: searchResult.reason });
        } else {
          issues.push({ claim, status: "UNVERIFIED_IMPORTANT", reason: searchResult.reason });
          revised = revised.replace(claim, `${claim} [未验证，需谨慎]`);
        }
      } else {
        issues.push({ claim, status: "UNVERIFIED_IMPORTANT", reason: verification.reason });
        revised = revised.replace(claim, `${claim} [未验证，需谨慎]`);
      }
    } else if (verification.status === "NOT_VERIFIED" && !verification.important) {
      issues.push({ claim, status: "REMOVED_UNIMPORTANT", reason: verification.reason });
      revised = revised.replace(claim, "");
    } else {
      issues.push({ claim, status: "VERIFIED", reason: verification.reason });
    }
  }

  return {
    revisedOutput: revised !== output ? revised : null,
    issues,
  };
}
