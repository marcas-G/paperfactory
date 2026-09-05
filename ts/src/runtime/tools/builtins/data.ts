import * as Effect from "effect/Effect";
import { Skill } from "../../../capabilities/generic/capability";
import { ToolOutput } from "../contracts";

export interface DataInput {
  action: "parse_csv" | "statistics" | "transform";
  data: string | number[];
}

export const createDataTool = (): Skill => ({
  name: "data_process",
  description: "Parse CSV data, compute statistics, or transform data",
  execute: (input: Record<string, unknown>) =>
    Effect.try({
      try: () => {
        const action = (input.action as string) || "statistics";
        const data = input.data as string | number[];

        if (action === "parse_csv") {
          const csv = data as string;
          const lines = csv.trim().split("\n");
          const headers = lines[0].split(",");
          const rows = lines.slice(1).map((line) => {
            const values = line.split(",");
            const row: Record<string, string> = {};
            headers.forEach((h, i) => (row[h.trim()] = values[i]?.trim() || ""));
            return row;
          });
          return {
            type: "result" as const,
            content: JSON.stringify({ headers, rows, rowCount: rows.length }),
            isError: false,
          } as unknown as Record<string, unknown>;
        }

        if (action === "statistics") {
          const numbers = Array.isArray(data)
            ? (data as number[])
            : ((data as string)
                .split(",")
                .map(Number)
                .filter((n) => !isNaN(n)));

          if (numbers.length === 0) {
            return {
              type: "result" as const,
              content: JSON.stringify({ error: "No numeric data" }),
              isError: true,
            } as unknown as Record<string, unknown>;
          }

          const sum = numbers.reduce((a, b) => a + b, 0);
          const mean = sum / numbers.length;
          const variance = numbers.reduce((s, n) => s + (n - mean) ** 2, 0) / numbers.length;
          const stdDev = Math.sqrt(variance);
          const sorted = [...numbers].sort((a, b) => a - b);
          const median =
            sorted.length % 2 === 0
              ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
              : sorted[Math.floor(sorted.length / 2)];

          return {
            type: "result" as const,
            content: JSON.stringify({
              mean,
              median,
              stdDev,
              variance,
              min: sorted[0],
              max: sorted[sorted.length - 1],
              length: numbers.length,
              sum,
            }),
            isError: false,
          } as unknown as Record<string, unknown>;
        }

        return {
          type: "result" as const,
          content: `Unknown data action: ${action}`,
          isError: true,
        } as unknown as Record<string, unknown>;
      },
      catch: (err) => `Data processing error: ${err}`,
    }),
});
