// One-off helper: sign in a test user and print a fresh access-token (JWT)
// to stdout so it can be captured into an env var for ad-hoc curl/verification
// scripts. Supabase access tokens expire after 1 hour, so this is the
// path-of-least-friction when a paste-from-the-app token has gone stale.
//
// Run: npx tsx scripts/get-test-jwt.ts
//
// Required env vars (NOT read from .env — credentials must be supplied by
// the caller, not committed alongside project config):
//   TEST_USER_EMAIL
//   TEST_USER_PASSWORD
//
// Reads SUPABASE URL + anon key from .env (EXPO_PUBLIC_* variants).
// Prints ONLY the access_token to stdout. All diagnostics go to stderr.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function parseDotenv(path: string): Record<string, string> {
  const text = readFileSync(path, 'utf8');
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

async function main(): Promise<void> {
  const email    = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    console.error(
      'Missing credentials. Set both env vars before running:\n' +
      '  PowerShell: $env:TEST_USER_EMAIL = "..."; $env:TEST_USER_PASSWORD = "..."\n' +
      '  bash:       export TEST_USER_EMAIL=...; export TEST_USER_PASSWORD=...',
    );
    process.exit(1);
  }

  let envFile: Record<string, string>;
  try {
    envFile = parseDotenv(resolve(process.cwd(), '.env'));
  } catch (err) {
    console.error(`Failed to read .env: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const supabaseUrl = envFile.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey     = envFile.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(`signInWithPassword failed: ${error.message}`);
    process.exit(1);
  }
  const token = data?.session?.access_token;
  if (!token) {
    console.error('signInWithPassword returned no access_token');
    process.exit(1);
  }

  process.stdout.write(token);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
