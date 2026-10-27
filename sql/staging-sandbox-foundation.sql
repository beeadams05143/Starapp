-- STAR UVM sandbox foundation. TEST PROJECT ONLY; NO PRODUCTION DATA.
begin;
create extension if not exists pgcrypto;
create schema if not exists star_sandbox;
revoke all on schema star_sandbox from public, anon;
grant usage on schema star_sandbox to authenticated;

create table if not exists public.groups (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 1 and 120),
 created_by uuid not null references auth.users(id),
 invite_code text unique,
 join_code text unique,
 archived boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.group_members (
 group_id uuid not null references public.groups(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member' check(role in ('member','admin')),
 joined_at timestamptz not null default now(),
 primary key(group_id,user_id)
);
create index if not exists star_test_group_members_user on public.group_members(user_id,group_id);

create or replace function star_sandbox.is_member(p_group uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and exists (
 select 1 from public.group_members m where m.group_id=p_group and m.user_id=(select auth.uid())
); $$;
create or replace function star_sandbox.is_admin(p_group uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select (select auth.uid()) is not null and exists (
 select 1 from public.group_members m where m.group_id=p_group and m.user_id=(select auth.uid()) and m.role='admin'
); $$;
revoke all on function star_sandbox.is_member(uuid), star_sandbox.is_admin(uuid) from public,anon;
grant execute on function star_sandbox.is_member(uuid), star_sandbox.is_admin(uuid) to authenticated;

-- The existing ISA migration expects these two predicates.
create or replace function public.star_team_updates_member(p_group uuid) returns boolean
language sql stable security invoker set search_path = ''
as $$ select star_sandbox.is_member(p_group); $$;
create or replace function public.star_team_updates_admin(p_group uuid) returns boolean
language sql stable security invoker set search_path = ''
as $$ select star_sandbox.is_admin(p_group); $$;
revoke all on function public.star_team_updates_member(uuid),public.star_team_updates_admin(uuid) from public,anon;
grant execute on function public.star_team_updates_member(uuid), public.star_team_updates_admin(uuid) to authenticated;

-- The group creator automatically gets admin access; browsers cannot self-assign admin.
create or replace function star_sandbox.owner_membership() returns trigger
language plpgsql security definer set search_path = ''
as $$ begin
 insert into public.group_members(group_id,user_id,role) values(new.id,new.created_by,'admin');
 return new;
end $$;
revoke all on function star_sandbox.owner_membership() from public,anon,authenticated;
drop trigger if exists star_sandbox_add_owner on public.groups;
create trigger star_sandbox_add_owner after insert on public.groups
for each row execute function star_sandbox.owner_membership();

-- A code admits an authenticated user as MEMBER ONLY; it never returns an admin role.
create or replace function public.join_group(p_code text) returns table(group_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare v_group uuid;
begin
 if (select auth.uid()) is null then raise exception 'Sign in to join a test group'; end if;
 if length(btrim(coalesce(p_code,''))) < 6 then raise exception 'Invalid invite code'; end if;
 select g.id into v_group from public.groups g
 where g.archived=false and (upper(g.invite_code)=upper(btrim(p_code))
 or lower(g.join_code)=lower(btrim(p_code))) limit 1;
 if v_group is null then raise exception 'Invalid invite code'; end if;
 insert into public.group_members(group_id,user_id,role) values(v_group,(select auth.uid()),'member')
 on conflict(group_id,user_id) do nothing;
 return query select v_group;
end $$;
revoke all on function public.join_group(text) from public,anon;
grant execute on function public.join_group(text) to authenticated;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 group_id uuid references public.groups(id),
 default_group_id uuid references public.groups(id),
 full_name text not null default '',
 public_name text not null default '',
 display_name text not null default '',
 role text default 'caregiver',
 is_admin boolean not null default false,
 avatar_url text,
 time_zone text,
 onboarding_complete boolean not null default false,
 onboarding_step text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.caregiver_checkin_configs (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null unique references public.groups(id) on delete cascade,
 individual_id uuid,
 selected_categories jsonb not null default '[]'::jsonb,
 selected_items jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.caregiver_checkins (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 group_id uuid not null references public.groups(id),
 caregiver_name text not null default '',
 date date not null,
 payload jsonb not null default '{}'::jsonb,
 submitted_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create index if not exists star_test_checkin_group_date on public.caregiver_checkins(group_id,date);
create table if not exists public.caregiver_checkin_drafts (
 id uuid primary key,
 author_user_id uuid not null references auth.users(id),
 group_id uuid not null references public.groups(id),
 author_display_name_snapshot text not null default '',
 checkin_date date,
 draft_data jsonb not null,
 version integer not null default 1 check(version>=1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists star_test_drafts_owner on public.caregiver_checkin_drafts(author_user_id,group_id);

create or replace function star_sandbox.touch_updated_at() returns trigger language plpgsql
set search_path='' as $$ begin new.updated_at:=now();return new;end $$;
drop trigger if exists star_test_draft_touch on public.caregiver_checkin_drafts;
create trigger star_test_draft_touch before update on public.caregiver_checkin_drafts for each row execute function star_sandbox.touch_updated_at();
drop trigger if exists star_test_config_touch on public.caregiver_checkin_configs;
create trigger star_test_config_touch before update on public.caregiver_checkin_configs for each row execute function star_sandbox.touch_updated_at();

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.profiles enable row level security;
alter table public.caregiver_checkin_configs enable row level security;
alter table public.caregiver_checkins enable row level security;
alter table public.caregiver_checkin_drafts enable row level security;
revoke all on public.groups,public.group_members,public.profiles,public.caregiver_checkin_configs,public.caregiver_checkins,public.caregiver_checkin_drafts from anon;
grant select,insert on public.groups to authenticated;
grant select on public.group_members to authenticated;
grant select,insert,update on public.profiles to authenticated;
grant select,insert,update on public.caregiver_checkin_configs to authenticated;
grant select,insert on public.caregiver_checkins to authenticated;
grant select,insert,update,delete on public.caregiver_checkin_drafts to authenticated;

create policy star_test_groups_read on public.groups for select to authenticated
using (created_by=(select auth.uid()) or star_sandbox.is_member(id));
create policy star_test_groups_create on public.groups for insert to authenticated
with check(created_by=(select auth.uid()) and archived=false);

create policy star_test_members_read on public.group_members for select to authenticated
using (user_id=(select auth.uid()) or star_sandbox.is_member(group_id));
-- No direct membership insert/update/delete from API: use owner trigger and join_group RPC.

create policy star_test_profiles_read on public.profiles for select to authenticated
using (id=(select auth.uid()) or (group_id is not null and star_sandbox.is_member(group_id)));
create policy star_test_profiles_insert on public.profiles for insert to authenticated
with check(id=(select auth.uid()) and (group_id is null or star_sandbox.is_member(group_id)));
create policy star_test_profiles_update on public.profiles for update to authenticated
using (id=(select auth.uid()))
with check(id=(select auth.uid()) and (group_id is null or star_sandbox.is_member(group_id)));

create policy star_test_config_read on public.caregiver_checkin_configs for select to authenticated
using(star_sandbox.is_member(group_id));
create policy star_test_config_insert on public.caregiver_checkin_configs for insert to authenticated
with check(star_sandbox.is_admin(group_id));
create policy star_test_config_update on public.caregiver_checkin_configs for update to authenticated
using(star_sandbox.is_admin(group_id)) with check(star_sandbox.is_admin(group_id));

create policy star_test_checkins_read on public.caregiver_checkins for select to authenticated
using(star_sandbox.is_member(group_id));
create policy star_test_checkins_insert on public.caregiver_checkins for insert to authenticated
with check(user_id=(select auth.uid()) and star_sandbox.is_member(group_id) and (payload->>'entry_date')=date::text);

create policy star_test_drafts_read on public.caregiver_checkin_drafts for select to authenticated
using(author_user_id=(select auth.uid()) and star_sandbox.is_member(group_id));
create policy star_test_drafts_insert on public.caregiver_checkin_drafts for insert to authenticated
with check(author_user_id=(select auth.uid()) and star_sandbox.is_member(group_id));
create policy star_test_drafts_update on public.caregiver_checkin_drafts for update to authenticated
using(author_user_id=(select auth.uid()) and star_sandbox.is_member(group_id))
with check(author_user_id=(select auth.uid()) and star_sandbox.is_member(group_id));
create policy star_test_drafts_delete on public.caregiver_checkin_drafts for delete to authenticated
using(author_user_id=(select auth.uid()) and star_sandbox.is_member(group_id));
commit;