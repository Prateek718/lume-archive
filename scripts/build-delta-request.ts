// One-off helper: build + POST a real GeminiDeltaCommentaryRequest in a
// single Node process. Credentials enter via interactive stdin prompts
// (email echoed; password hidden via raw-mode stdin) and live only in heap
// memory; the JWT obtained at sign-in is used to call the edge function
// and never written or printed. The script writes three artifacts to
// scratch/ for downstream validation:
//
//   scratch/delta-request-body.json   — request body POSTed to the function
//   scratch/delta-curl-response.json  — function response body verbatim
//   scratch/delta-curl-status.txt     — HTTP status code (digits only)
//
// Run from an interactive terminal:
//   npx tsx scripts/build-delta-request.ts

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import * as readline from 'node:readline';
import { createClient } from '@supabase/supabase-js';

interface ScanRow {
  id:                     string;
  created_at:             string;
  skin_concerns:          string[] | null;
  skin_concerns_detailed: unknown[] | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Mirrors services/deltaService.ts:83-85 — clamps to ≥1 day so a same-day
// rescan never reports zero, matching the canonical delta computation.
function diffDays(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / MS_PER_DAY));
}

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

function readLineEchoed(prompt: string): Promise<string> {
  return new Promise((resolveLine) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolveLine(answer.trim());
    });
  });
}

// Raw-mode hidden-input read. Echoes nothing for printable characters;
// handles Enter (submit), Ctrl+C (exit 130), and Backspace.
function readPasswordHidden(prompt: string): Promise<string> {
  return new Promise((resolvePwd, rejectPwd) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      rejectPwd(new Error(
        'stdin is not a TTY; password cannot be read with echo suppressed. ' +
        'Run this script from an interactive terminal.',
      ));
      return;
    }
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (code === 13 || code === 10) {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolvePwd(buf);
          return;
        }
        if (code === 3) {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (code === 127 || code === 8) {
          if (buf.length > 0) buf = buf.slice(0, -1);
          continue;
        }
        if (code >= 32) buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const env = parseDotenv(resolve(process.cwd(), '.env'));
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey     = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set in .env');
    process.exit(1);
  }

  const email    = await readLineEchoed('Test user email: ');
  const password = await readPasswordHidden('Test user password: ');
  if (!email || !password) {
    console.error('email and password are required');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: signIn, error: signErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signErr || !signIn?.user?.id || !signIn?.session?.access_token) {
    console.error(`signInWithPassword failed: ${signErr?.message ?? 'no session returned'}`);
    process.exit(1);
  }
  const uid = signIn.user.id;
  const jwt = signIn.session.access_token;

  const { data: scans, error: scanErr } = await supabase
    .from('scans')
    .select('id, created_at, skin_concerns, skin_concerns_detailed')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(2);
  if (scanErr) {
    console.error(`scan fetch failed: ${scanErr.message}`);
    process.exit(1);
  }
  const rows = (scans ?? []) as ScanRow[];
  if (rows.length < 2) {
    console.error(`Need at least 2 scans for delta; got ${rows.length}`);
    process.exit(1);
  }

  const curr = rows[0];
  const prev = rows[1];

  // scanNumber is not stored on the scans row — services/scanService.ts:253-259
  // derives it as priorScanCount+1 at insertion time. Since `curr` is the most
  // recent scan, its ordinal equals the total scan count for this user.
  const { count: scanCount, error: countErr } = await supabase
    .from('scans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid);
  if (countErr || scanCount === null) {
    console.error(`scan count failed: ${countErr?.message ?? 'no count returned'}`);
    process.exit(1);
  }
  const scanNumber = scanCount;

  const days_between = diffDays(new Date(prev.created_at), new Date(curr.created_at));
  const prevSet = new Set(prev.skin_concerns ?? []);
  const currSet = new Set(curr.skin_concerns ?? []);
  const concerns_improved   = [...prevSet].filter((c) => !currSet.has(c));
  const concerns_new        = [...currSet].filter((c) => !prevSet.has(c));
  const concerns_persistent = [...prevSet].filter((c) =>  currSet.has(c));

  const requestBody = {
    previousScan: {
      skin_concerns:          prev.skin_concerns ?? [],
      skin_concerns_detailed: prev.skin_concerns_detailed ?? [],
    },
    currentScan: {
      skin_concerns:          curr.skin_concerns ?? [],
      skin_concerns_detailed: curr.skin_concerns_detailed ?? [],
    },
    scanDelta: {
      days_between,
      concerns_improved,
      concerns_new,
      concerns_persistent,
    },
    scanNumber,
    scanId:     curr.id,
  };

  const scratchDir = resolve(process.cwd(), 'scratch');
  mkdirSync(scratchDir, { recursive: true });
  const bodyPath   = resolve(scratchDir, 'delta-request-body.json');
  const respPath   = resolve(scratchDir, 'delta-curl-response.json');
  const statusPath = resolve(scratchDir, 'delta-curl-status.txt');

  const bodyJson  = JSON.stringify(requestBody, null, 2);
  const bodyBytes = Buffer.byteLength(bodyJson, 'utf8');
  writeFileSync(bodyPath, bodyJson, 'utf8');

  console.log(`user_tail            = ...${uid.slice(-4)}`);
  console.log(`current_scan_id      = ${curr.id}`);
  console.log(`previous_scan_id     = ${prev.id}`);
  console.log(`current_created_at   = ${curr.created_at}`);
  console.log(`previous_created_at  = ${prev.created_at}`);
  console.log(`days_between         = ${days_between}`);
  console.log(`concerns_improved    = [${concerns_improved.join(',')}]`);
  console.log(`concerns_new         = [${concerns_new.join(',')}]`);
  console.log(`concerns_persistent  = [${concerns_persistent.join(',')}]`);
  console.log(`prev_detailed_len    = ${(prev.skin_concerns_detailed ?? []).length}`);
  console.log(`curr_detailed_len    = ${(curr.skin_concerns_detailed ?? []).length}`);
  console.log(`scanNumber           = ${requestBody.scanNumber}`);
  console.log(`body_file            = ${bodyPath}`);
  console.log(`body_bytes           = ${bodyBytes}`);

  const fnUrl     = `${supabaseUrl}/functions/v1/gemini-delta-commentary`;
  const startedAt = Date.now();
  const resp      = await fetch(fnUrl, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type':  'application/json',
    },
    body: bodyJson,
  });
  const latencyMs = Date.now() - startedAt;
  const respText  = await resp.text();
  const respBytes = Buffer.byteLength(respText, 'utf8');
  writeFileSync(respPath,   respText,            'utf8');
  writeFileSync(statusPath, String(resp.status), 'utf8');

  console.log(`curl_status          = ${resp.status}`);
  console.log(`curl_latency_ms      = ${latencyMs}`);
  console.log(`response_file        = ${respPath}`);
  console.log(`response_bytes       = ${respBytes}`);
  console.log(`status_file          = ${statusPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
