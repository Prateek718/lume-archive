// Kit service — user_kit CRUD + helpers for linking products to routine steps.

import { supabase } from '../lib/supabase';
import { backfillKitItemIdForStep } from './habitService';
import type { MatchedProduct } from '../types';

export interface UserKitRow {
  id:                       string;
  user_id:                  string;
  product_id:               string;
  step_id:                  string | null;
  acquired_via:             'lume_affiliate' | 'already_owned' | 'replaced';
  acquired_at:              string;
  last_reorder_at:          string | null;
  estimated_duration_days:  number | null;
  is_active:                boolean;
  created_at:               string;
  updated_at:               string;
}

// Build a stable product id from a MatchedProduct. Prefer the catalogue id;
// fall back to a slug of brand+name for legacy matches that lack one.
export function productIdFor(product: MatchedProduct): string {
  if (product.id) return product.id;
  const slug = `${product.brand}_${product.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return slug;
}

// Called when the user taps "Buy" in ProductPickerSheet. Inserts a user_kit
// row (marking any existing active row for the same step as inactive first),
// then calls backfillKitItemIdForStep so today's and future check-ins reference
// the new kit item.
export async function addProductToKitFromBuy(params: {
  userId:        string;
  product:       MatchedProduct;
  stepId:        string;
  acquiredVia?:  'lume_affiliate' | 'already_owned';
}): Promise<string | null> {
  const { userId, product, stepId, acquiredVia = 'lume_affiliate' } = params;
  const product_id = productIdFor(product);

  // Deactivate any existing active row for this (user, step).
  const { error: deactivateErr } = await supabase
    .from('user_kit')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('step_id', stepId)
    .eq('is_active', true);
  if (deactivateErr) {
    console.error('[kit] deactivate prior row failed', deactivateErr);
  }

  const { data, error } = await supabase
    .from('user_kit')
    .insert({
      user_id:                  userId,
      product_id,
      step_id:                  stepId,
      acquired_via:             acquiredVia,
      estimated_duration_days:  null,
      is_active:                true,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[kit] insert failed', error);
    return null;
  }

  const kitItemId = (data as { id: string } | null)?.id ?? null;
  if (kitItemId) {
    try {
      await backfillKitItemIdForStep(userId, stepId, kitItemId);
    } catch (err) {
      console.error('[kit] backfill failed', err);
    }
  }
  return kitItemId;
}

// Fetch all active kit rows for a user.
export async function fetchActiveKit(userId: string): Promise<UserKitRow[]> {
  const { data, error } = await supabase
    .from('user_kit')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('acquired_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserKitRow[];
}

// Soft-delete: mark a kit row inactive.
export async function removeKitItem(kitId: string): Promise<void> {
  const { error } = await supabase
    .from('user_kit')
    .update({ is_active: false })
    .eq('id', kitId);
  if (error) throw error;
}

// Record a re-order timestamp (for surfacing "reordered N days ago" later).
export async function markKitReordered(kitId: string): Promise<void> {
  const { error } = await supabase
    .from('user_kit')
    .update({ last_reorder_at: new Date().toISOString() })
    .eq('id', kitId);
  if (error) console.error('[kit] mark reorder failed', error);
}
