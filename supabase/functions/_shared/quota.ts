// Per-user-per-24h quota check. Counts rows in gemini_usage scoped to the
// caller + call_type within the last 24 hours. Fails closed on errors so
// a Postgres outage can't open the door to uncapped Gemini calls (§8.1).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { CallType } from "./types.ts";

let admin: SupabaseClient | null = null;
function getAdmin(): SupabaseClient | null {
  if (admin) return admin;
  const url = Deno.env.get("SUPABASE_URL");
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !srk) return null;
  admin = createClient(url, srk);
  return admin;
}

export interface QuotaResult {
  ok:           boolean;
  remaining:    number;
  resetSeconds: number;
  failed?:      true;
}

export interface QuotaArgs {
  userId:   string;
  callType: CallType;
  ceiling:  number;
}

// Returns { failed: true } on Postgres failure — caller must translate to 503
// and abort. Returns { ok: false } on quota saturation — caller returns 429.
export async function checkQuota(args: QuotaArgs): Promise<QuotaResult> {
  const client = getAdmin();
  if (!client) {
    console.error("[quota] missing service role env, failing closed");
    return { ok: false, remaining: 0, resetSeconds: 60, failed: true };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await client
    .from("gemini_usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id",   args.userId)
    .eq("call_type", args.callType)
    .gte("created_at", since);

  if (error) {
    console.error("[quota] check failed, failing closed:", error.message);
    return { ok: false, remaining: 0, resetSeconds: 60, failed: true };
  }

  const used = count ?? 0;
  const remaining = Math.max(0, args.ceiling - used);
  return {
    ok:           used < args.ceiling,
    remaining,
    resetSeconds: 86400,
  };
}
