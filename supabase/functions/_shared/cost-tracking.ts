// Server-side gemini_usage telemetry writer. Fire-and-forget — the insert
// is dispatched via EdgeRuntime.waitUntil so it never extends user-visible
// scan latency (§7.2 of the architecture doc).
//
// PRICING + computeCost are duplicated from lib/geminiUsage.ts:6-33 so the
// client copy can be deleted without breaking server costs.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { CallType, ModelName } from "./types.ts";

const PRICING: Record<ModelName, { input: number; output: number }> = {
  "gemini-2.5-pro":        { input: 1.25 / 1_000_000, output: 10.00 / 1_000_000 },
  "gemini-2.5-flash":      { input: 0.30 / 1_000_000, output: 2.50  / 1_000_000 },
  "gemini-2.5-flash-lite": { input: 0.10 / 1_000_000, output: 0.40  / 1_000_000 },
};

export function computeCost(
  model:        ModelName,
  inputTokens:  number,
  outputTokens: number,
): number {
  const rates = PRICING[model];
  return inputTokens * rates.input + outputTokens * rates.output;
}

// Module-scope admin client. Created once per cold-start, reused across
// requests so warm inserts use a pooled connection. SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY are auto-populated by the Edge runtime
// (verified in Gate 3).
let admin: SupabaseClient | null = null;
function getAdmin(): SupabaseClient | null {
  if (admin) return admin;
  const url = Deno.env.get("SUPABASE_URL");
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !srk) return null;
  admin = createClient(url, srk);
  return admin;
}

export interface LogUsageArgs {
  userId:       string;
  scanId:       string | null;
  callType:     CallType;
  model:        ModelName;
  inputTokens:  number;
  outputTokens: number;
  durationMs:   number;
  success:      boolean;
  errorMessage?: string;
}

// Fire-and-forget — caller wraps with EdgeRuntime.waitUntil. A logging
// failure is non-fatal; observability is not correctness. (§7.2)
export function logUsage(args: LogUsageArgs): Promise<void> {
  const client = getAdmin();
  if (!client) {
    console.error("[gemini-usage] missing service role env, skipping insert");
    return Promise.resolve();
  }

  const cost = computeCost(args.model, args.inputTokens, args.outputTokens);

  return client
    .from("gemini_usage")
    .insert({
      user_id:        args.userId,
      scan_id:        args.scanId,
      call_type:      args.callType,
      model:          args.model,
      input_tokens:   args.inputTokens,
      output_tokens:  args.outputTokens,
      cost_usd:       cost,
      duration_ms:    args.durationMs,
      success:        args.success,
      error_message:  args.errorMessage ?? null,
    })
    .then(({ error }) => {
      if (error) {
        console.error("[gemini-usage] insert failed (non-fatal):", error.message);
      }
    });
}
