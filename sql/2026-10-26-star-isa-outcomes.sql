-- STAR ISA Outcome Cards: additive foundation. Existing caregiver records are untouched.
begin;
create table if not exists public.star_isa_outcomes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  individual_id text not null default '',
  category text not null check (length(btrim(category)) between 1 and 120),
  title text not null check (length(btrim(title)) between 1 and 160),
  outcome_text text not null default '' check (length(outcome_text) <= 5000),
  voice_source text not null default 'none' check (voice_source in ('none','individual','observed')),
  voice_text text not null default '' check (length(voice_text) <= 3000),
  strategies jsonb not null default '[]'::jsonb check (jsonb_typeof(strategies) = 'array' and jsonb_array_length(strategies) <= 30),
  measurements jsonb not null default '[]'::jsonb check (jsonb_typeof(measurements) = 'array' and jsonb_array_length(measurements) <= 30),
  assigned_user_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(assigned_user_ids) = 'array' and jsonb_array_length(assigned_user_ids) <= 100),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  effective_date date,
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index if not exists star_isa_outcomes_group_person on public.star_isa_outcomes (group_id,individual_id,status);
create or replace function public.star_isa_outcomes_write_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
 if tg_op = 'INSERT' then
   new.created_by := (select auth.uid());
   new.created_at := now();
   new.version := 1;
 else
   if new.group_id is distinct from old.group_id or
      new.individual_id is distinct from old.individual_id or
      new.created_by is distinct from old.created_by or
      new.created_at is distinct from old.created_at then
     raise exception 'ISA outcome ownership and group cannot change';
   end if;
   new.version := old.version + 1;
 end if;
 new.title := btrim(new.title);
 new.category := btrim(new.category);
 new.updated_by := (select auth.uid());
 new.updated_at := now();
 return new;
end;
$$;
drop trigger if exists star_isa_outcomes_write on public.star_isa_outcomes;
create trigger star_isa_outcomes_write
before insert or update on public.star_isa_outcomes
for each row execute function public.star_isa_outcomes_write_guard();

-- Revision snapshots keep prior definitions available when outcome cards change.
create table if not exists public.star_isa_outcome_revisions(
  id bigint generated always as identity primary key,
  outcome_id uuid not null references public.star_isa_outcomes(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  version integer not null,
  actor_id uuid,
  changed_at timestamptz not null default now(),
  snapshot jsonb not null,
  unique(outcome_id,version)
);
create or replace function public.star_isa_outcomes_audit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 insert into public.star_isa_outcome_revisions(outcome_id,group_id,version,actor_id,snapshot)
 values(new.id,new.group_id,new.version,(select auth.uid()),to_jsonb(new));
 return new;
end;
$$;
-- The audit function is trigger-only; do not expose it through the public API.
revoke all on function public.star_isa_outcomes_audit() from public, anon, authenticated;
drop trigger if exists star_isa_outcomes_audit_write on public.star_isa_outcomes;
create trigger star_isa_outcomes_audit_write
after insert or update on public.star_isa_outcomes
for each row execute function public.star_isa_outcomes_audit();

alter table public.star_isa_outcomes enable row level security;
alter table public.star_isa_outcome_revisions enable row level security;
revoke all on public.star_isa_outcomes from anon;
revoke all on public.star_isa_outcome_revisions from anon,authenticated;
grant select,insert,update on public.star_isa_outcomes to authenticated;
grant select on public.star_isa_outcome_revisions to authenticated;
drop policy if exists isa_outcome_team_read on public.star_isa_outcomes;
create policy isa_outcome_team_read on public.star_isa_outcomes for select to authenticated
 using (public.star_team_updates_member(group_id));
drop policy if exists isa_outcome_admin_insert on public.star_isa_outcomes;
create policy isa_outcome_admin_insert on public.star_isa_outcomes for insert to authenticated
 with check (public.star_team_updates_admin(group_id));
drop policy if exists isa_outcome_admin_update on public.star_isa_outcomes;
create policy isa_outcome_admin_update on public.star_isa_outcomes for update to authenticated
 using (public.star_team_updates_admin(group_id))
 with check (public.star_team_updates_admin(group_id));
drop policy if exists isa_outcome_history_team_read on public.star_isa_outcome_revisions;
create policy isa_outcome_history_team_read on public.star_isa_outcome_revisions for select to authenticated
 using (public.star_team_updates_member(group_id));
-- No delete rights: archive cards instead; keep revision history.
commit;