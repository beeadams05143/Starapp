-- UVM rjozzwmkvlndanoaghtc ONLY: enrich the explicitly generated Test-team fixture.
-- No real caregiver check-ins, individual answers, or other groups are changed.
begin;
do $$ begin
 if not exists(select 1 from auth.users where id='00110000-0000-4000-8000-000000000002' and raw_app_meta_data->>'fictional_demo'='true' and banned_until='infinity'::timestamptz) then raise exception 'Synthetic caregiver missing'; end if;
end $$;
update public.caregiver_checkins c set payload=(c.payload-'pet_activity_flag') || jsonb_build_object(
 'support_time_fixture','v1',
 'shift_supports',(select jsonb_agg(s.value || jsonb_build_object('minutes',case s.value->>'support' when 'In-home support' then 90+((c.date-date '2026-10-01')%3)*15 when 'Community support' then 45 when 'Employment support' then 60 when 'Respite' then 90 end) order by s.ord) from jsonb_array_elements(c.payload->'shift_supports') with ordinality s(value,ord)),
 'community_interaction_ok',case when (c.date-date '2026-10-01')%3=0 then 'yes' else 'no' end,
 'interaction_type',case when (c.date-date '2026-10-01')%3=0 then to_jsonb(array[case (c.date-date '2026-10-01')%4 when 0 then 'Asked a question' when 1 then 'Requested help' when 2 then 'Shared space respectfully' else 'Small talk' end]) else '[]'::jsonb end,
 'interaction_note',case when (c.date-date '2026-10-01')%3=0 then 'FICTIONAL: Jamie used their preferred way to communicate during the library visit.' else '' end,
 'pet_interaction_flag',case when (c.date-date '2026-10-01')%5=0 then 'yes' else 'no' end,
 'pet_activity_type',case when (c.date-date '2026-10-01')%5=0 then 'Refilled water bowls' else '' end,
 'pet_activity_note',case when (c.date-date '2026-10-01')%5=0 then 'FICTIONAL: helped refill a water bowl with a reminder.' else '' end,
 'home_activity_type',to_jsonb(case (c.date-date '2026-10-01')%4 when 0 then 'Listen to music with family' when 1 then 'Outside time in yard / neighborhood' when 2 then 'Meal in the common area' else 'Walk / Stroll' end))
where c.group_id='89d4a593-2e74-48fc-9104-d6112498a3e9'
 and c.user_id='00110000-0000-4000-8000-000000000002'
 and c.payload->>'fixture_set'='test-team-checkins-v1'
 and c.payload->>'fictional_test_data'='true'
 and c.payload->>'individual_id'='00110000-0000-4000-8000-000000000001';
commit;
