-- UVM TEST ONLY. Already applied to isolated STAR sandbox; NOT production.
create or replace function star_sandbox.stamp_checkin_isa_provenance()
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
for each row execute function star_sandbox.stamp_checkin_isa_provenance();
