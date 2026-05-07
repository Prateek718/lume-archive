# Database migrations

This folder is the source of truth for the application's PostgreSQL schema.
Every change to the database — table creation, column changes, constraints,
functions, triggers, indexes, RLS policies — is recorded here as a versioned
migration file.

## Filename convention

Migrations are named with a `phase_*` prefix and run in filename-sort order
(numerics before letters). Current phases:

- `phase_00_*` — baseline files capturing schema that was originally created
  via the Supabase dashboard before this project adopted a migrations-folder
  workflow. These represent ground zero for version-controlled schema.
- `phase_3a`, `phase_4a3`, `phase_7b`, `phase_7c`, `phase_a5`, `phase_c`
  through `phase_f`, `phase_x_*` — historical migrations from before the
  ground-zero baseline. Some are stale and may be removed during cleanup.
- `phase_xi_*` — Phase XI cleanup migrations: explicit corrections, drops,
  and additions discovered during the codebase-database audit.
- New migrations going forward should use a clear `phase_<num>_<name>.sql`
  convention. Avoid `phase_x_*` (the `x` was a placeholder for unphased work).

## Required properties of every migration

1. **Idempotent.** Applying the same migration twice must produce the same
   result as applying it once. Use `CREATE TABLE IF NOT EXISTS`,
   `DROP CONSTRAINT IF EXISTS / ADD CONSTRAINT`,
   `CREATE INDEX IF NOT EXISTS`,
   `CREATE OR REPLACE FUNCTION`, etc.

2. **Non-destructive by default.** Never drop tables, columns, or data
   without an explicit, intentional reason documented in the file's
   header comment AND the commit message. The default expectation is
   that a migration adds or modifies; deletions are explicit exceptions.

3. **Self-contained.** Each migration must apply cleanly given only the
   migrations that precede it in filename order. Do not reference
   external state.

4. **Explicit grants.** Function grants should be set explicitly rather
   than relying on Postgres or Supabase defaults. Follow principle of
   least privilege.

5. **RLS by default.** Every table in the public schema must have RLS
   enabled. The `ensure_rls` event trigger (see
   `phase_00_baseline_users_and_helpers.sql`) auto-enables RLS on new
   tables, but explicit `alter table ... enable row level security`
   should still be added at the end of any migration that creates tables.

6. **Documented.** Each file has a header comment stating its purpose
   and any non-obvious behavior. Each commit message explains the why
   behind the change, not just the what.

7. **Snake_case policy names.** RLS policies follow the convention
   `<table>_<action>_<scope>` (e.g. `scans_select_own`, `users_insert_own`,
   `waitlist_insert_anyone`). This replaces the legacy human-readable names
   created via the Supabase dashboard UI. Future migrations should use
   this convention for any new policies.

## Application

Migrations are applied manually via the Supabase dashboard SQL editor in
filename-sort order. The Supabase CLI is not currently configured for
this project; introducing it is a future improvement.

When applying a new migration:
1. Read the file end-to-end. Confirm understanding of every statement.
2. Run in the SQL editor. Watch for errors.
3. Verify expected effects (e.g., new column appears in
   `information_schema.columns`).
4. Commit the migration file with a thorough commit message.
