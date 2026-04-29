// Token + cost logging for Gemini calls.
// Fire-and-forget: a logging failure must never break a scan.

import { supabase } from './supabase';

const PRICING = {
  'gemini-2.5-pro':        { input: 1.25 / 1_000_000, output: 10.00 / 1_000_000 },
  'gemini-2.5-flash':      { input: 0.30 / 1_000_000, output: 2.50  / 1_000_000 },
  'gemini-2.5-flash-lite': { input: 0.10 / 1_000_000, output: 0.40  / 1_000_000 },
} as const;

export type ModelName = keyof typeof PRICING;
export type CallType = 'vision' | 'skin_recs' | 'beard_recs' | 'makeup_recs' | 'hair_recs';

export interface UsageRecord {
  callType:     CallType;
  model:        ModelName;
  inputTokens:  number;
  outputTokens: number;
  durationMs:   number;
  success:      boolean;
  errorMessage?: string;
  scanId?:      string | null;
}

export function computeCost(
  model:        ModelName,
  inputTokens:  number,
  outputTokens: number,
): number {
  const rates = PRICING[model];
  return inputTokens * rates.input + outputTokens * rates.output;
}

export async function logUsage(record: UsageRecord): Promise<void> {
  const cost = computeCost(record.model, record.inputTokens, record.outputTokens);

  console.log(
    `[gemini ${record.callType}] ${record.model} | ` +
    `in=${record.inputTokens} out=${record.outputTokens} | ` +
    `cost=$${cost.toFixed(5)} | ${record.durationMs}ms | ` +
    `${record.success ? 'ok' : 'FAIL: ' + (record.errorMessage ?? 'unknown')}`
  );

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('gemini_usage').insert({
      user_id:        user.id,
      scan_id:        record.scanId ?? null,
      call_type:      record.callType,
      model:          record.model,
      input_tokens:   record.inputTokens,
      output_tokens:  record.outputTokens,
      cost_usd:       cost,
      duration_ms:    record.durationMs,
      success:        record.success,
      error_message:  record.errorMessage ?? null,
    });
  } catch (err) {
    console.warn('[gemini usage] DB insert failed (non-fatal):', err);
  }
}

export function formatScanTotal(records: UsageRecord[]): string {
  const totalIn   = records.reduce((s, r) => s + r.inputTokens,  0);
  const totalOut  = records.reduce((s, r) => s + r.outputTokens, 0);
  const totalCost = records.reduce((s, r) => s + computeCost(r.model, r.inputTokens, r.outputTokens), 0);
  const totalMs   = records.reduce((s, r) => s + r.durationMs,   0);
  return `[gemini scan total] ${records.length} calls | in=${totalIn} out=${totalOut} | cost=$${totalCost.toFixed(4)} | ${totalMs}ms`;
}
