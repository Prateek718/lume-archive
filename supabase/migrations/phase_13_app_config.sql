-- Phase XIII — server-controlled app_config remote flags
--
-- Operator-toggled feature flags. Client reads on launch and refreshes
-- every 5 minutes plus on foreground. Service role writes via Supabase
-- Studio. Authenticated users can SELECT; no INSERT/UPDATE/DELETE policies
-- exist so client writes are denied by RLS.
--
-- Seeded with the one flag this phase needs: gemini_scans_enabled.

create table if not exists public.app_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.users(id) on delete set null
);

comment on table public.app_config is
  'Server-controlled feature flags and operational toggles. Client reads
   these on app launch and refreshes every 5 minutes. Operator-writable
   only.';

alter table public.app_config enable row level security;

drop policy if exists app_config_select_all on public.app_config;
create policy app_config_select_all
  on public.app_config for select
  using (auth.role() = 'authenticated');

-- No INSERT/UPDATE/DELETE policies. Only service role writes (operator
-- via Supabase Studio).

create index if not exists idx_app_config_updated
  on public.app_config (updated_at desc);

insert into public.app_config (key, value)
values ('gemini_scans_enabled', 'true'::jsonb)
on conflict (key) do nothing;
