// lib/ai-usage.ts
import { createAdminClient } from "@/lib/auth/api-auth";

interface TrackUsageParams {
  advisorId: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

// Approximate costs per 1M tokens (USD)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
};

export async function trackAIUsage({ advisorId, inputTokens, outputTokens, model }: TrackUsageParams) {
  try {
    const supabase = createAdminClient();
    const month = new Date().toISOString().slice(0, 7); // '2026-04'
    const totalTokens = inputTokens + outputTokens;

    const costs = MODEL_COSTS[model] || MODEL_COSTS["claude-sonnet-4-20250514"];
    const costUsd = (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;

    await supabase.rpc("increment_ai_usage", {
      p_advisor_id: advisorId,
      p_month: month,
      p_tokens: totalTokens,
      p_cost: costUsd,
    });
  } catch (err) {
    // Non-blocking: log but don't fail the request
    console.error("Failed to track AI usage:", err);
  }
}
