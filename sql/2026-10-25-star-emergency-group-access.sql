-- STAR: Emergency Medical group-shared records. Apply in Supabase SQL Editor.
-- This creates an independent shared record; it does NOT delete or migrate any
-- existing emergency_medical rows. An administrator can open their existing
-- record in the updated Emergency page and save it into the shared record.
begin;

create table if not exists public.star_emergency_records (
  group_id uuid not null references public.groups(id) on delete cascade,
  individual_id text not null default '',
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (group_id, individual_id)
);

create or replace function public.star_emergency_member(p_group uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.group_members gm
    where gm.group_id = p_group and gm.user_id = (select auth.uid())
  );
$$;
create or replace function public.star_emergency_admin(p_group uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.group_members gm
    where gm.group_id = p_group and gm.user_id = (select auth.uid())
      and gm.role = 'admin'
  );
$$;

revoke all on function public.star_emergency_member(uuid) from public, anon;
revoke all on function public.star_emergency_admin(uuid) from public, anon;
grant execute on function public.star_emergency_member(uuid) to authenticated;
grant execute on function public.star_emergency_admin(uuid) to authenticated;

create or replace function public.star_emergency_stamp()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and
    (new.group_id is distinct from old.group_id or
     new.individual_id is distinct from old.individual_id) then
     raise exception 'Cannot move an emergency record to another group or individual';
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists star_emergency_stamp_trigger on public.star_emergency_records;
create trigger star_emergency_stamp_trigger
before insert or update on public.star_emergency_records
for each row execute function public.star_emergency_stamp();

alter table public.star_emergency_records enable row level security;
revoke all on public.star_emergency_records from public, anon, authenticated;
grant select, insert, update on public.star_emergency_records to authenticated;

drop policy if exists star_emergency_group_read on public.star_emergency_records;
create policy star_emergency_group_read on public.star_emergency_records
for select to authenticated
using (public.star_emergency_member(group_id));

drop policy if exists star_emergency_group_admin_insert on public.star_emergency_records;
create policy star_emergency_group_admin_insert on public.star_emergency_records
for insert to authenticated
with check (public.star_emergency_admin(group_id));

drop policy if exists star_emergency_group_admin_update on public.star_emergency_records;
create policy star_emergency_group_admin_update on public.star_emergency_records
for update to authenticated
using (public.star_emergency_admin(group_id))
with check (public.star_emergency_admin(group_id));

-- Existing legacy per-user records remain READABLE under their current RLS
-- and can be imported by an admin, but no authenticated user can keep editing
-- them via a direct API request after this migration.
revoke insert, update, delete on public.emergency_medical from authenticated, anon, public;

commit;
