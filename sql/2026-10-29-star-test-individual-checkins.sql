-- STAR TEST ONLY. Fictional, voluntary My STAR check-ins. Do not apply to STAR Live.
-- Self-reports are not caregiver observations, ISA achievement, or emergency alerts.
create table if not exists public.star_individual_checkins_test (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  individual_id text not null default '',
  author_user_id uuid not null default auth.uid(),
  checkin_date date not null default current_date,
  response_type text not null check (response_type in ('mood','comfort','daily_experience','leisure_preference')),
  response_value text not null check (length(btrim(response_value)) between 1 and 500),
  original_words text not null default '' check (length(original_words) <= 2000),
  offered_options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(offered_options) = 'array' and jsonb_array_length(offered_options) <= 20),
  support_kind text not null default 'not_reported' check (length(support_kind) <= 160),
  is_fictional boolean not null default true check (is_fictional = true),
  demo_source_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists star_individual_checkins_test_group_date
  on public.star_individual_checkins_test(group_id,checkin_date desc,created_at desc);
alter table public.star_individual_checkins_test enable row level security;
revoke all on public.star_individual_checkins_test from anon, public;
grant select, insert on public.star_individual_checkins_test to authenticated;
create policy star_test_self_reports_read on public.star_individual_checkins_test
for select to authenticated
using (star_sandbox.is_member(group_id));
create policy star_test_self_reports_insert on public.star_individual_checkins_test
for insert to authenticated
with check (
  author_user_id = (select auth.uid())
  and star_sandbox.is_member(group_id)
  and is_fictional = true
);
comment on table public.star_individual_checkins_test is
 'TEST ONLY: fictional optional individual check-ins; the original individual answers are not ISA progress or verified clinical observations.';
