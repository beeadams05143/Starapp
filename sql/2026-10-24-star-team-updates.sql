-- STAR Team Updates: run once in Supabase SQL Editor before using the new dashboard page.
-- Existing caregiver check-ins and their permissions are not modified.
begin;

create table if not exists public.star_team_updates (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  individual_id text not null default '',
  category text not null check (category in ('medication','learning','other')),
  title text not null check (length(btrim(title)) between 1 and 160),
  details text not null check (length(btrim(details)) between 1 and 5000),
  source_note text not null default '' check (length(source_note) <= 500),
  effective_date date not null,
  status text not null default 'active' check (status in ('active','closed')),
  closed_on date,
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint star_team_updates_close_date check (
    (status = 'active' and closed_on is null) or
    (status = 'closed' and closed_on is not null and closed_on >= effective_date)
  )
);
create index if not exists star_team_updates_group_scope
  on public.star_team_updates (group_id, individual_id, effective_date);
create index if not exists star_team_updates_group_status
  on public.star_team_updates (group_id, status);

-- These functions deliberately consult the authoritative group membership,
-- not the frontend role, to prevent write access by non-admins.
create or replace function public.star_team_updates_member(p_group uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.group_members gm
    where gm.group_id = p_group and gm.user_id = (select auth.uid())
  );
$$;
create or replace function public.star_team_updates_admin(p_group uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.group_members gm
    where gm.group_id = p_group and gm.user_id = (select auth.uid())
      and gm.role = 'admin'
  );
$$;
revoke all on function public.star_team_updates_member(uuid) from public, anon;
revoke all on function public.star_team_updates_admin(uuid) from public, anon;
grant execute on function public.star_team_updates_member(uuid) to authenticated;
grant execute on function public.star_team_updates_admin(uuid) to authenticated;

create or replace function public.star_team_updates_before_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_at := now();
  else
    if new.group_id is distinct from old.group_id
       or new.individual_id is distinct from old.individual_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Group, individual, and original authorship cannot be changed';
    end if;
  end if;
  new.title := btrim(new.title);
  new.details := btrim(new.details);
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  if new.status = 'active' then
    new.closed_on := null;
  end if;
  return new;
end;
$$;
drop trigger if exists star_team_updates_write_guard on public.star_team_updates;
create trigger star_team_updates_write_guard
before insert or update on public.star_team_updates
for each row execute function public.star_team_updates_before_write();

-- Immutable, group-scoped revision history. Users cannot directly write revisions.
create table if not exists public.star_team_update_revisions (
  id bigint generated always as identity primary key,
  update_id uuid not null references public.star_team_updates(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  actor_id uuid not null,
  changed_at timestamptz not null default now(),
  old_snapshot jsonb,
  new_snapshot jsonb not null
);
create index if not exists star_team_update_revisions_lookup
  on public.star_team_update_revisions (group_id, update_id, changed_at);

create or replace function public.star_team_updates_audit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.star_team_update_revisions
    (update_id, group_id, actor_id, old_snapshot, new_snapshot)
  values
    (new.id, new.group_id, (select auth.uid()),
      case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
      to_jsonb(new));
  return new;
end;
$$;
drop trigger if exists star_team_updates_audit_insert on public.star_team_updates;
drop trigger if exists star_team_updates_audit_update on public.star_team_updates;
create trigger star_team_updates_audit_insert after insert on public.star_team_updates
for each row execute function public.star_team_updates_audit();
create trigger star_team_updates_audit_update after update on public.star_team_updates
for each row execute function public.star_team_updates_audit();

alter table public.star_team_updates enable row level security;
alter table public.star_team_update_revisions enable row level security;
revoke all on public.star_team_updates from anon;
revoke all on public.star_team_update_revisions from anon;
revoke all on public.star_team_update_revisions from authenticated;
grant select, insert, update on public.star_team_updates to authenticated;
grant select on public.star_team_update_revisions to authenticated;

drop policy if exists star_team_updates_group_read on public.star_team_updates;
create policy star_team_updates_group_read on public.star_team_updates
for select to authenticated using (public.star_team_updates_member(group_id));
drop policy if exists star_team_updates_admin_insert on public.star_team_updates;
create policy star_team_updates_admin_insert on public.star_team_updates
for insert to authenticated with check (public.star_team_updates_admin(group_id));
drop policy if exists star_team_updates_admin_update on public.star_team_updates;
create policy star_team_updates_admin_update on public.star_team_updates
for update to authenticated
using (public.star_team_updates_admin(group_id))
with check (public.star_team_updates_admin(group_id));
drop policy if exists star_team_update_revisions_group_read on public.star_team_update_revisions;
create policy star_team_update_revisions_group_read on public.star_team_update_revisions
for select to authenticated using (public.star_team_updates_member(group_id));

-- No DELETE policy for authenticated users. Close updates instead.
commit;
