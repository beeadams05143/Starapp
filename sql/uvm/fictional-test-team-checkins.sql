-- UVM Supabase rjozzwmkvlndanoaghtc ONLY.
-- Reproducible fictional reports for the Test team's own Jamie profile.
-- Existing check-ins are never changed. Re-running adds no duplicates.
begin;
do $$ begin
 if not exists(select 1 from public.groups where id='89d4a593-2e74-48fc-9104-d6112498a3e9' and name='Test')
 or not exists(select 1 from public.group_members where group_id='89d4a593-2e74-48fc-9104-d6112498a3e9' and user_id='00110000-0000-4000-8000-000000000001' and team_role='individual')
 or not exists(select 1 from auth.users where id='00110000-0000-4000-8000-000000000002' and raw_app_meta_data->>'fictional_demo'='true' and banned_until='infinity'::timestamptz)
 then raise exception 'Expected UVM fictional team and synthetic accounts are missing'; end if;
end $$;
with days as (
 select day::date as day,(day::date-date '2026-10-01') as n,extract(isodow from day)::int as weekday
 from generate_series(date '2026-10-01',date '2026-11-08',interval '1 day') day
), samples as (
 select *,
 case n%4 when 0 then 'FICTIONAL: Jamie chose music after breakfast and helped clear the table.'
 when 1 then 'FICTIONAL: Jamie chose a quiet break, then joined a short walk.'
 when 2 then 'FICTIONAL: Jamie used a picture choice to pick a game and took turns with support.'
 else 'FICTIONAL: Jamie chose to prepare a snack with a verbal reminder.' end as note,
 jsonb_build_array(jsonb_build_object('support','In-home support','location','At home','note','FICTIONAL: meal preparation and daily routine'))
 || case when n%3=0 then jsonb_build_array(jsonb_build_object('support','Community support','location','In the community','note','FICTIONAL: library visit and short walk')) else '[]'::jsonb end
 || case when weekday in (1,3,5) then jsonb_build_array(jsonb_build_object('support','Employment support','location','At a place of employment','note','FICTIONAL: supported sorting practice')) else '[]'::jsonb end
 || case when weekday=6 then jsonb_build_array(jsonb_build_object('support','Respite','location','At home','note','FICTIONAL: games and a quiet break')) else '[]'::jsonb end as supports
 from days
)
insert into public.caregiver_checkins(id,user_id,group_id,caregiver_name,date,payload,submitted_at,created_at,had_bm,hygiene,food_prep,cleanup,vocational_time,community_time,new_skill_score,caregiver_notes)
select md5('star-test-team-checkins-v1:'||day::text)::uuid,
 '00110000-0000-4000-8000-000000000002','89d4a593-2e74-48fc-9104-d6112498a3e9','Casey Green — Fictional Caregiver',day,
 jsonb_build_object(
 'fictional_test_data',true,'fixture_set','test-team-checkins-v1',
 'individual_id','00110000-0000-4000-8000-000000000001','individual_name','Jamie Rivers — Fictional Individual',
 'entry_date',day::text,'caregiver_name','Casey Green — Fictional Caregiver','caregiver_notes',note,
 'shift_supports',supports,'summary_highlight_note',note,'daily_living_notes',note,
 'hours_sleep',7.5+(n%4)*0.5,'had_bm','yes','appears_tired',case when n%6=0 then 'yes' else 'no' end,
 'appears_good_health','yes','prn_given','no','prn_entries','[]'::jsonb,
 'mood_energy','typical','mood_irritability','none','mood_engagement_score',2+(n%3),
 'hygiene',true,'food_prep',n%2=0,'cleanup',true,
 'adl_category','Hygiene / Toileting','adl_activity','Morning routine','prompting_level',1+(n%3),
 'home_activity_flag','yes','home_activity_type','Listen to music with family','home_activity_time','30–60 min','home_activity_prompting',1+(n%3),
 'public_activity_flag',case when n%3=0 then 'yes' else 'no' end,
 'public_activity_type',case when n%3=0 then 'Library visit' else '' end,
 'public_activity_time',case when n%3=0 then '30–60 min' else '0 min' end,
 'public_activity_note',case when n%3=0 then 'FICTIONAL: chose a book using picture choices.' else '' end,
 'vocational_participation',case when weekday in (1,3,5) then 'yes' else 'no' end,
 'vocational_time',case when weekday in (1,3,5) then '30–60 min' else '0 min' end,
 'vocational_prompting',1+(n%3),'vocational_notes',case when weekday in (1,3,5) then 'FICTIONAL: practiced sorting with a visual checklist.' else '' end,
 'behavior_anomaly_flag','no','aggression_flag','no','safety_incident_occurred','no',
 'isa_entries','[]'::jsonb
 ),
 (day::timestamp+interval '18 hours') at time zone 'America/New_York',
 (day::timestamp+interval '18 hours') at time zone 'America/New_York',
 true,true,n%2=0,true,case when weekday in (1,3,5) then 60 else 0 end,case when n%3=0 then 60 else 0 end,1+(n%3),note
from samples
on conflict(id) do nothing;
commit;
