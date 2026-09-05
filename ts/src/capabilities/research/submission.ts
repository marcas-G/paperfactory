import * as Effect from "effect/Effect";
import { Capability, createCapability, Skill } from "../generic/capability";
import { Provider } from "@runtime/provider";

export const prepareSkill: Skill = {
  name: "submission_prepare",
  description: "Prepare submission materials (cover letter) for a venue using LLM",
  execute: (input: Record<string, unknown>) => {
    const reportContent = input.reportContent as string;
    const venue = input.venue as string;
    const provider = input.provider as Provider | undefined;

    if (provider) {
      const prompt = `Write a cover letter for submitting a paper to ${venue}.
The paper abstract is: ${reportContent}
Keep it professional and concise.`;

      return Effect.map(
        provider.sendMessages([{ role: "user", content: prompt }]),
        (response) => ({
          coverLetter: response.content,
          venue,
        })
      );
    }

    return Effect.succeed({
      coverLetter: `Cover letter for ${venue}: ${reportContent}`,
      venue,
    });
  },
};

export const submissionCapability: Capability = createCapability(
  "submission",
  "Prepare and manage paper submissions to venues",
  [prepareSkill],
  []
);
