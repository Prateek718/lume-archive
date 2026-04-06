// Temporary image storage during scan processing.
// Images are uploaded, used for AI analysis, then immediately deleted.
// We use Supabase Storage here (same credentials, no extra setup needed).
// Note: CLAUDE.md specifies Cloudflare R2 — that migration can happen
// via a Supabase Edge Function proxy once you need it.

import { supabase } from './supabase';

const BUCKET = 'scan-temp';

// Upload a base64 JPEG to Supabase Storage.
// Returns the public URL so Gemini can fetch it.
// The file is stored under a path unique to the user.
export async function uploadTempImage(
  userId: string,
  base64: string,
): Promise<string> {
  const path     = `${userId}/${Date.now()}.jpg`;
  const byteArr  = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, byteArr, {
      contentType: 'image/jpeg',
      upsert:      true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Delete the image once processing is complete.
// Called immediately after the scan is saved to the database.
export async function deleteTempImage(userId: string, url: string): Promise<void> {
  // Extract the file path from the full URL
  const path = url.split(`/${BUCKET}/`)[1];
  if (!path) return;

  await supabase.storage.from(BUCKET).remove([path]);
}
