-- UVM TEST ONLY. Already applied to isolated STAR sandbox; NOT production.
-- STAR UVM ONLY. Per-caregiver check-in assignments and explicitly approved ISA answer links.
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
create or replace function star_sandbox.validate_assignment() returns trigger language plpgsql
security invoker set search_path = '' as $$
begin
 if not exists(select 1 from public.group_members gm join public.profiles p on p.id=gm.user_id
   where gm.group_id=new.group_id and gm.user_id=new.caregiver_user_id and p.role='caregiver')
 then raise exception 'Assigned caregiver must be a registered caregiver in the group'; end if;
 if not exists(select 1 from public.group_members gm join public.profiles p on p.id=gm.user_id
   where gm.group_id=new.group_id and gm.user_id=new.individual_id and p.role='individual')
 then raise exception 'Assigned individual must be an individual in the group'; end if;
 new.updated_at = now();
 return new;
end $$;
drop trigger if exists star_caregiver_assignment_validate on public.star_caregiver_checkin_assignments;
create trigger star_caregiver_assignment_validate before insert or update on public.star_caregiver_checkin_assignments
 for each row execute function star_sandbox.validate_assignment();

create or replace function star_sandbox.validate_measure_link() returns trigger language plpgsql
security invoker set search_path = '' as $$
declare target public.star_caregiver_checkin_assignments%rowtype;
declare outcome public.star_isa_outcomes%rowtype;
begin
 select * into target from public.star_caregiver_checkin_assignments where id=new.assignment_id;
 select * into outcome from public.star_isa_outcomes where id=new.outcome_id;
 if not found or target.group_id is distinct from new.group_id or outcome.group_id is distinct from new.group_id then
   raise exception 'Outcome and caregiver assignment must belong to the same group';
 end if;
 if not exists(select 1 from jsonb_array_elements(outcome.measurements) m where m->>'id'=new.measurement_id) then
   raise exception 'Measurement is not in the selected ISA card';
 end if;
 if outcome.individual_id not in ('',target.individual_id::text) then
   raise exception 'ISA card belongs to a different individual';
 end if;
 if new.approved_by is distinct from auth.uid() then raise exception 'Approval must be made by signed-in administrator'; end if;
 return new;
end $$;
drop trigger if exists star_isa_measure_link_validate on public.star_isa_measure_links;
create trigger star_isa_measure_link_validate before insert or update on public.star_isa_measure_links
for each row execute function star_sandbox.validate_measure_link();
alter table public.star_caregiver_checkin_assignments enable row level security;
alter table public.star_isa_measure_links enable row level security;
revoke all on public.star_caregiver_checkin_assignments,public.star_isa_measure_links from anon,public;
grant select,insert,update on public.star_caregiver_checkin_assignments to authenticated;
grant select,insert,delete on public.star_isa_measure_links to authenticated;
create policy star_cg_assignment_read on public.star_caregiver_checkin_assignments for select to authenticated
 using(star_sandbox.is_admin(group_id) or (caregiver_user_id=(select auth.uid()) and star_sandbox.is_member(group_id)));
create policy star_cg_assignment_insert on public.star_caregiver_checkin_assignments for insert to authenticated
 with check(star_sandbox.is_admin(group_id));
create policy star_cg_assignment_update on public.star_caregiver_checkin_assignments for update to authenticated
 using(star_sandbox.is_admin(group_id)) with check(star_sandbox.is_admin(group_id));
create policy star_isa_measure_link_read on public.star_isa_measure_links for select to authenticated
 using(star_sandbox.is_admin(group_id) or (star_sandbox.is_member(group_id)
  and exists(select 1 from public.star_caregiver_checkin_assignments a where a.id=assignment_id and a.caregiver_user_id=(select auth.uid()))));
create policy star_isa_measure_link_insert on public.star_isa_measure_links for insert to authenticated
 with check(star_sandbox.is_admin(group_id) and approved_by=(select auth.uid()));
create policy star_isa_measure_link_delete on public.star_isa_measure_links for delete to authenticated
 using(star_sandbox.is_admin(group_id));

