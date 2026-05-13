// One-off helper: build + POST a real GeminiXxxRecsRequest to one of the
// three Phase XIII-b Flash edge functions (gemini-hair-recs,
// gemini-makeup-recs, gemini-beard-recs) in a single Node process.
// Credentials enter via interactive stdin prompts (email echoed; password
// hidden via raw-mode stdin) and live only in heap memory; the JWT
// obtained at sign-in is used to call the edge function and never written
// or printed. The script writes three artifacts to scratch/ for downstream
// validation:
//
//   scratch/<fn>-request-body.json    — request body POSTed to the function
//   scratch/<fn>-curl-response.json   — function response body verbatim
//   scratch/<fn>-curl-status.txt      — HTTP status code (digits only)
//
// Run from an interactive terminal — picks one function via the argv slot:
//   npx tsx scripts/build-flash-request.ts hair
//   npx tsx scripts/build-flash-request.ts makeup
//   npx tsx scripts/build-flash-request.ts beard
//   npx tsx scripts/build-flash-request.ts skin

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as readline from 'node:readline';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type FnKey = 'hair' | 'makeup' | 'beard' | 'skin';

interface FnSpec {
  key:  FnKey;
  slug: string;            // edge function path slug
  artifactPrefix: string;  // scratch file prefix
}

const FN_TABLE: Record<FnKey, FnSpec> = {
  hair:   { key: 'hair',   slug: 'gemini-hair-recs',   artifactPrefix: 'hair-recs'   },
  makeup: { key: 'makeup', slug: 'gemini-makeup-recs', artifactPrefix: 'makeup-recs' },
  beard:  { key: 'beard',  slug: 'gemini-beard-recs',  artifactPrefix: 'beard-recs'  },
  skin:   { key: 'skin',   slug: 'gemini-skin-recs',   artifactPrefix: 'skin-recs'   },
};

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

// Re-shape stored scan columns into the GeminiVisionResponse the analysis
// field expects. Mirrors services/scanService.ts:976-992 (analysisFromScan).
async function fetchLatestAnalysis(supabase: SupabaseClient, uid: string): Promise<{
  analysis: Record<string, unknown>;
  scanId:   string;
}> {
  const { data, error } = await supabase
    .from('scans')
    .select('id, face_shape, skin_type, skin_concerns, skin_concerns_detailed, beard_density, beard_condition, brow_condition, undereye, score_skin, fitzpatrick_scale, skin_undertone, recommendations')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`scan fetch failed: ${error?.message ?? 'no scan'}`);

  const recs = (data.recommendations as Record<string, unknown> | null) ?? null;
  const observation = (recs && typeof recs === 'object') ? recs.observation : undefined;

  return {
    scanId: data.id as string,
    analysis: {
      face_shape:             data.face_shape,
      skin_type:              data.skin_type,
      skin_concerns:          data.skin_concerns,
      skin_concerns_detailed: data.skin_concerns_detailed ?? [],
      beard_density:          data.beard_density,
      beard_condition:        data.beard_condition,
      brow_condition:         data.brow_condition,
      undereye:               data.undereye,
      score_skin:             data.score_skin,
      fitzpatrick_scale:      data.fitzpatrick_scale ?? null,
      skin_undertone:         data.skin_undertone ?? null,
      observation:            observation ?? undefined,
    },
  };
}

async function buildHairBody(supabase: SupabaseClient, uid: string): Promise<Record<string, unknown>> {
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('hair_profile, gender, city')
    .eq('id', uid)
    .single();
  if (userErr || !userRow) throw new Error(`user fetch failed: ${userErr?.message ?? 'no row'}`);
  if (!userRow.hair_profile) {
    throw new Error('User has no hair_profile — run hair setup first or pick a different test account.');
  }

  // Pull the most recent scan's face_shape (optional context; null if no scan exists).
  const { data: scan } = await supabase
    .from('scans')
    .select('face_shape')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // matchedProducts: leave empty — the server-side prompt accepts an empty list,
  // and the curl test doesn't need to exercise the catalog scorer end-to-end.
  // The contract validation already requires the field to be an array.
  return {
    profile:         userRow.hair_profile,
    faceShape:       (scan?.face_shape as string | null | undefined) ?? null,
    gender:          (userRow.gender as string | null) ?? 'man',
    city:            (userRow.city   as string | null) ?? null,
    budget:          'affordable',
    matchedProducts: [],
    scanId:          null,
  };
}

async function buildMakeupBody(supabase: SupabaseClient, uid: string): Promise<Record<string, unknown>> {
  const { analysis, scanId } = await fetchLatestAnalysis(supabase, uid);
  return { analysis, scanId };
}

async function buildBeardBody(supabase: SupabaseClient, uid: string): Promise<Record<string, unknown>> {
  const { analysis, scanId } = await fetchLatestAnalysis(supabase, uid);
  const { data: userRow } = await supabase
    .from('users')
    .select('beard_goal')
    .eq('id', uid)
    .single();
  return {
    analysis,
    beardGoal: (userRow?.beard_goal as string | null) ?? null,
    scanId,
  };
}

async function buildSkinBody(supabase: SupabaseClient, uid: string): Promise<Record<string, unknown>> {
  const { analysis, scanId } = await fetchLatestAnalysis(supabase, uid);
  const { data: userRow } = await supabase
    .from('users')
    .select('age_range')
    .eq('id', uid)
    .single();
  // matchedProducts: leave empty — server prompt accepts the empty list and
  // the curl test doesn't need to exercise the catalog scorer end-to-end.
  return {
    analysis,
    matchedProducts: [],
    ageRange:        (userRow?.age_range as string | null) ?? null,
    scanId,
  };
}

async function main(): Promise<void> {
  const argFn = (process.argv[2] ?? '').toLowerCase() as FnKey;
  const spec = FN_TABLE[argFn];
  if (!spec) {
    console.error('Usage: npx tsx scripts/build-flash-request.ts <hair|makeup|beard|skin>');
    process.exit(1);
  }

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

  let requestBody: Record<string, unknown>;
  if (spec.key === 'hair')        requestBody = await buildHairBody(supabase,   uid);
  else if (spec.key === 'makeup') requestBody = await buildMakeupBody(supabase, uid);
  else if (spec.key === 'beard')  requestBody = await buildBeardBody(supabase,  uid);
  else                            requestBody = await buildSkinBody(supabase,   uid);

  const scratchDir = resolve(process.cwd(), 'scratch');
  mkdirSync(scratchDir, { recursive: true });
  const bodyPath   = resolve(scratchDir, `${spec.artifactPrefix}-request-body.json`);
  const respPath   = resolve(scratchDir, `${spec.artifactPrefix}-curl-response.json`);
  const statusPath = resolve(scratchDir, `${spec.artifactPrefix}-curl-status.txt`);

  const bodyJson  = JSON.stringify(requestBody, null, 2);
  const bodyBytes = Buffer.byteLength(bodyJson, 'utf8');
  writeFileSync(bodyPath, bodyJson, 'utf8');

  console.log(`function             = ${spec.slug}`);
  console.log(`user_tail            = ...${uid.slice(-4)}`);
  console.log(`body_file            = ${bodyPath}`);
  console.log(`body_bytes           = ${bodyBytes}`);

  const fnUrl     = `${supabaseUrl}/functions/v1/${spec.slug}`;
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
