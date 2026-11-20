-- Production team roles and caregiver-specific check-in assignments.
create schema star_staff;
revoke all on schema star_staff from public,anon;
grant usage on schema star_staff to authenticated;
alter table public.group_members add column team_role text
check(team_role in ('administrator','caregiver','individual','case_manager'));

create policy star_staff_membership_default on public.group_members as restrictive for insert
to authenticated with check(team_role is null);

create function star_staff.team_role(g uuid,u uuid) returns text
language sql stable security invoker set search_path='' as $$
 select case when m.role='admin' then 'administrator' else
   coalesce(m.team_role,case when r.individual_id is not null or p.role='individual' then 'individual' else 'caregiver' end) end
 from public.group_members m left join public.profiles p on p.id=m.user_id
 left join public.star_individual_people r on r.group_id=m.group_id and r.individual_id=m.user_id
 where m.group_id=g and m.user_id=u;
$$;
revoke all on function star_staff.team_role(uuid,uuid) from public,anon;
grant execute on function star_staff.team_role(uuid,uuid) to authenticated;

create function star_staff.list_members(g uuid)
returns table(user_id uuid,display_name text,membership_role text,assigned_role text)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.group_members m where m.group_id=g and m.user_id=auth.uid())
 then raise exception 'Not authorized for this group'; end if;
 return query select m.user_id,coalesce(nullif(p.public_name,''),nullif(p.display_name,''),nullif(p.full_name,''),'Team member'),m.role::text,star_staff.team_role(g,m.user_id)
 from public.group_members m left join public.profiles p on p.id=m.user_id
 where m.group_id=g order by (m.role='admin') desc,coalesce(p.public_name,p.full_name,''),m.user_id;
end;
$$;
revoke all on function star_staff.list_members(uuid) from public,anon;
grant execute on function star_staff.list_members(uuid) to authenticated;

create function public.star_team_members(p_group_id uuid)
returns table(user_id uuid,display_name text,membership_role text,assigned_role text)
language sql stable security invoker set search_path='' as $$
 select * from star_staff.list_members(p_group_id);
$$;
revoke all on function public.star_team_members(uuid) from public,anon;
grant execute on function public.star_team_members(uuid) to authenticated;

create function star_staff.assign_team_role(g uuid,u uuid,new_role text) returns void
language plpgsql security definer set search_path='' as $$
declare old_role public.group_members.role%type;
begin
 if auth.uid() is null then raise exception 'Sign in to assign roles'; end if;
 perform 1 from public.groups where id=g for update;
 if not exists(select 1 from public.group_members where group_id=g and user_id=auth.uid() and role='admin')
 then raise exception 'Only an administrator can assign roles'; end if;
 if new_role is null or new_role not in ('administrator','caregiver','individual','case_manager') then raise exception 'Invalid role'; end if;
 select role into old_role from public.group_members where group_id=g and user_id=u for update;
 if not found then raise exception 'User is not a member of this group'; end if;
 if old_role='admin' and new_role<>'administrator' and not exists(
   select 1 from public.group_members gm join auth.users a on a.id=gm.user_id
   where gm.group_id=g and gm.role='admin' and gm.user_id<>u and (a.banned_until is null or a.banned_until<=now())
 ) then raise exception 'Cannot remove the last administrator'; end if;
 if new_role='administrator' then
   update public.group_members set team_role=new_role,role='admin' where group_id=g and user_id=u;
 else
   update public.group_members set team_role=new_role,role='member' where group_id=g and user_id=u;
 end if;
 if new_role='individual' then
   insert into public.star_individual_people(group_id,individual_id) values(g,u) on conflict do nothing;
 end if;
end;
$$;
revoke all on function star_staff.assign_team_role(uuid,uuid,text) from public,anon;
grant execute on function star_staff.assign_team_role(uuid,uuid,text) to authenticated;
create function public.star_assign_team_role(p_group_id uuid,p_user_id uuid,p_role text) returns void
language sql security invoker set search_path='' as $$
 select star_staff.assign_team_role(p_group_id,p_user_id,p_role);
$$;
revoke all on function public.star_assign_team_role(uuid,uuid,text) from public,anon;
grant execute on function public.star_assign_team_role(uuid,uuid,text) to authenticated;

-- Case managers have report access without becoming hands-on supporters.
create or replace function star_individual.is_supporter(g uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
   select 1 from public.group_members m left join public.profiles p on p.id=m.user_id
   where m.group_id=g and m.user_id=auth.uid() and (
     m.role='admin' or m.team_role='caregiver' or
     (m.team_role is null and p.role='caregiver' and star_staff.team_role(g,auth.uid())='caregiver')
   )
 );
$$;
create function star_staff.is_case_manager(g uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.group_members where group_id=g and user_id=(select auth.uid()) and role<>'admin' and team_role='case_manager');
$$;
revoke all on function star_staff.is_case_manager(uuid) from public,anon;
grant execute on function star_staff.is_case_manager(uuid) to authenticated;

create policy star_staff_case_manager_checkins_read on public.star_individual_checkins for select to authenticated
using(star_staff.is_case_manager(group_id));
create policy star_staff_case_manager_observations_read on public.star_individual_observations for select to authenticated
using(star_staff.is_case_manager(group_id) and review_status='linked_observation');

create policy star_staff_care_checkin_insert on public.caregiver_checkins as restrictive for insert to authenticated
with check(group_id is not null and star_individual.is_supporter(group_id));
create policy star_staff_care_checkin_update on public.caregiver_checkins as restrictive for update to authenticated
using(star_individual.is_supporter(group_id)) with check(star_individual.is_supporter(group_id));
create policy star_staff_care_checkin_delete on public.caregiver_checkins as restrictive for delete to authenticated
using(star_individual.is_supporter(group_id));
create policy star_staff_checkin_config_insert on public.caregiver_checkin_configs as restrictive for insert to authenticated
with check(star_individual.is_admin(group_id));
create policy star_staff_checkin_config_update on public.caregiver_checkin_configs as restrictive for update to authenticated
using(star_individual.is_admin(group_id)) with check(star_individual.is_admin(group_id));
create policy star_staff_checkin_config_delete on public.caregiver_checkin_configs as restrictive for delete to authenticated
using(star_individual.is_admin(group_id));

create table if not exists public.star_caregiver_checkin_assignments (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.groups(id) on delete cascade,
 individual_id uuid not null references public.profiles(id),
 caregiver_user_id uuid not null references public.profiles(id),
 selected_categories jsonb not null default '[]'::jsonb,
 selected_items jsonb not null default '{}'::jsonb,
 active boolean not null default true,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique (group_id, individual_id, caregiver_user_id),
 check (jsonb_typeof(selected_categories) = 'array'),
 check (jsonb_typeof(selected_items) = 'object')
);
create index if not exists star_cg_assignments_caregiver_lookup
 on public.star_caregiver_checkin_assignments (group_id,caregiver_user_id) where active;
create table if not exists public.star_isa_measure_links (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.groups(id) on delete cascade,
 assignment_id uuid not null references public.star_caregiver_checkin_assignments(id) on delete cascade,
 outcome_id uuid not null references public.star_isa_outcomes(id) on delete cascade,
 measurement_id text not null,
 source_field text not null,
 approved_by uuid not null references auth.users(id),
 approved_at timestamptz not null default now(),
 unique(assignment_id,outcome_id,measurement_id),
 check(length(trim(source_field)) between 1 and 120),
 check(length(trim(measurement_id)) between 1 and 120)
);
create index if not exists star_isa_link_assignment on public.star_isa_measure_links(assignment_id);
create function star_staff.validate_assignment() returns trigger language plpgsql
security invoker set search_path='' as $$
begin
 if not exists(select 1 from star_staff.list_members(new.group_id) member
   where member.user_id=new.caregiver_user_id and member.assigned_role in ('caregiver','administrator'))
 then raise exception 'Assigned caregiver must support this group'; end if;
 if not exists(select 1 from star_staff.list_members(new.group_id) member
   where member.user_id=new.individual_id and member.assigned_role='individual')
 then raise exception 'Assigned individual must belong to the group'; end if;
 new.updated_at=now();
 return new;
end;
$$;
revoke all on function star_staff.validate_assignment() from public,anon,authenticated;
drop trigger if exists star_caregiver_assignment_validate on public.star_caregiver_checkin_assignments;
create trigger star_caregiver_assignment_validate before insert or update on public.star_caregiver_checkin_assignments
 for each row execute function star_staff.validate_assignment();

create or replace function star_staff.validate_measure_link() returns trigger language plpgsql security invoker set search_path='' as $$
declare target public.star_caregiver_checkin_assignments%rowtype;
declare outcome public.star_isa_outcomes%rowtype;
begin
 select * into target from public.star_caregiver_checkin_assignments where id=new.assignment_id;
 if not found then raise exception 'Caregiver assignment not found'; end if;
 select * into outcome from public.star_isa_outcomes where id=new.outcome_id;
 if not found then raise exception 'ISA outcome not found'; end if;
 if target.group_id is distinct from new.group_id or outcome.group_id is distinct from new.group_id then
  raise exception 'ISA outcome and assignment must belong to same group';
 end if;
 if outcome.status <> 'active' then raise exception 'Only active ISA outcomes can be linked'; end if;
 if not exists(select 1 from jsonb_array_elements(outcome.measurements) m where m->>'id'=new.measurement_id) then
  raise exception 'Unknown ISA measurement';
 end if;
 if outcome.individual_id <> '' and outcome.individual_id <> target.individual_id::text then
  raise exception 'ISA card belongs to a different individual';
 end if;
 if outcome.individual_id = '' and
 (select count(*) from star_staff.list_members(target.group_id) where assigned_role='individual') <> 1
 then raise exception 'Group-level ISA card is ambiguous across individuals'; end if;
 if new.approved_by is distinct from auth.uid() then
   raise exception 'Only the signed-in group administrator can approve a link';
 end if;
 return new;
end $$;
revoke all on function star_staff.validate_measure_link() from public,anon,authenticated;
drop trigger if exists star_isa_measure_link_validate on public.star_isa_measure_links;
create trigger star_isa_measure_link_validate before insert or update on public.star_isa_measure_links
for each row execute function star_staff.validate_measure_link();
alter table public.star_caregiver_checkin_assignments enable row level security;
alter table public.star_isa_measure_links enable row level security;
revoke all on public.star_caregiver_checkin_assignments,public.star_isa_measure_links from anon,public,authenticated;
grant select,insert,update on public.star_caregiver_checkin_assignments to authenticated;
grant select,insert,delete on public.star_isa_measure_links to authenticated;
create policy star_cg_assignment_read on public.star_caregiver_checkin_assignments for select to authenticated
 using(star_individual.is_admin(group_id) or (caregiver_user_id=(select auth.uid()) and star_individual.is_member(group_id)));
create policy star_cg_assignment_insert on public.star_caregiver_checkin_assignments for insert to authenticated
 with check(star_individual.is_admin(group_id));
create policy star_cg_assignment_update on public.star_caregiver_checkin_assignments for update to authenticated
 using(star_individual.is_admin(group_id)) with check(star_individual.is_admin(group_id));
create policy star_isa_measure_link_read on public.star_isa_measure_links for select to authenticated
 using(star_individual.is_admin(group_id) or (star_individual.is_member(group_id)
  and exists(select 1 from public.star_caregiver_checkin_assignments a where a.id=assignment_id and a.caregiver_user_id=(select auth.uid()))));
create policy star_isa_measure_link_insert on public.star_isa_measure_links for insert to authenticated
 with check(star_individual.is_admin(group_id) and approved_by=(select auth.uid()));
create policy star_isa_measure_link_delete on public.star_isa_measure_links for delete to authenticated
 using(star_individual.is_admin(group_id));

create or replace function star_staff.stamp_checkin_isa_provenance()
returns trigger language plpgsql security invoker set search_path='' as $$
declare stamped jsonb;
begin
 if new.id is null then new.id=gen_random_uuid(); end if;
 if jsonb_typeof(new.payload->'isa_entries')='array' then
  select coalesce(jsonb_agg(
    case when jsonb_typeof(e.value)='object' and e.value ? 'outcome_id' and e.value ? 'measurement_id'
      then e.value || jsonb_build_object('checkin_id',new.id::text)
      else e.value end
    order by e.ord),'[]'::jsonb) into stamped
  from jsonb_array_elements(new.payload->'isa_entries') with ordinality as e(value,ord);
  new.payload=jsonb_set(new.payload,'{isa_entries}',stamped);
 end if;
 return new;
end $$;
drop trigger if exists star_stamp_isa_provenance on public.caregiver_checkins;
create trigger star_stamp_isa_provenance before insert on public.caregiver_checkins
for each row execute function star_staff.stamp_checkin_isa_provenance();
revoke all on function star_staff.stamp_checkin_isa_provenance() from public,anon,authenticated;
notify pgrst,'reload schema';
