-- Isolated UVM test database ONLY. Applied and archived.
create or replace function star_sandbox.validate_measure_link() returns trigger language plpgsql security invoker set search_path='' as $$
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
 (select count(*) from public.group_members gm join public.profiles p on p.id=gm.user_id
  where gm.group_id=target.group_id and p.role='individual') <> 1
 then raise exception 'Group-level ISA card is ambiguous across individuals'; end if;
 if new.approved_by is distinct from auth.uid() then
   raise exception 'Only the signed-in group administrator can approve a link';
 end if;
 return new;
end $$;
