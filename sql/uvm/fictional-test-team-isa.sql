-- UVM rjozzwmkvlndanoaghtc ONLY: fictional ISA report examples for Test team's Jamie.
-- Stable IDs and DO NOTHING make this additive and repeatable; no real records change.
begin;
do $$ begin
 if not exists(select 1 from public.group_members where group_id='89d4a593-2e74-48fc-9104-d6112498a3e9' and user_id='00110000-0000-4000-8000-000000000001' and team_role='individual')
 or not exists(select 1 from auth.users where id='00110000-0000-4000-8000-000000000004' and raw_app_meta_data->>'fictional_demo'='true' and banned_until='infinity'::timestamptz)
 then raise exception 'Expected UVM fictional profiles missing'; end if;
end $$;
-- Synthetic disabled administrator, explicitly attributed as fixture author/reviewer.
select set_config('request.jwt.claim.sub','00110000-0000-4000-8000-000000000004',true);
create temporary table demo_isa_report_goals(k text,title text,category text,description text,voice text,metric text,kind text,unit text,activity text) on commit drop;
insert into demo_isa_report_goals values
 ('community','Choose a community activity — FICTIONAL','Community Participation','FICTIONAL example: Jamie explores preferred community activities with accessible choices and support.','FICTIONAL: I want to choose where we go.','Minutes participating','duration','minutes','Fictional community outing'),
 ('snack','Prepare a snack — FICTIONAL','Daily Living','FICTIONAL example: Jamie chooses and prepares a preferred snack with support as needed.','FICTIONAL: I want to make my snack.','Snack practice description','note','','Fictional snack preparation'),
 ('feelings','Share how I feel — FICTIONAL','Relationships','FICTIONAL example: Jamie shares feelings using speech, pictures, or My STAR, with time to answer.','FICTIONAL: I want people to listen to me.','Feeling shared','choice','','Fictional feelings check-in');
insert into public.star_isa_outcomes(id,group_id,individual_id,category,title,outcome_text,voice_source,voice_text,strategies,measurements,assigned_user_ids,status,effective_date)
select md5('star-test-isa-v1:'||k)::uuid,'89d4a593-2e74-48fc-9104-d6112498a3e9','00110000-0000-4000-8000-000000000001',category,title,description,'individual',voice,
 jsonb_build_array(jsonb_build_object('id',md5('star-test-strategy-v1:'||k)::uuid,'text','FICTIONAL: Offer two accessible choices, allow time, respect stopping or declining, and record what was shared.','who','Casey Green — Fictional Caregiver','when','During the chosen activity','where','Agreed activity setting')),
 jsonb_build_array(jsonb_build_object('id',md5('star-test-metric-v1:'||k)::uuid,'label',metric,'kind',kind,'unit',unit,'activity',activity,'frequency','when_occurs','report_mode','summary','choices',case when k='feelings' then '["Happy","Calm","Tired","Unsure"]'::jsonb else '[]'::jsonb end)),
 '["00110000-0000-4000-8000-000000000002"]'::jsonb,'active','2026-10-01'
from demo_isa_report_goals on conflict(id) do nothing;
with dates as (
 select day::date as day,row_number() over(order by day)::int as n from generate_series(date '2026-10-01',date '2026-11-08',interval '1 day') day where extract(isodow from day) in (3,7)
), evidence as (
 select d.day,d.n,jsonb_agg(jsonb_build_object('individual_id','00110000-0000-4000-8000-000000000001','outcome_id',md5('star-test-isa-v1:'||g.k)::uuid,'outcome_title',g.title,'outcome_category',g.category,'outcome_version',c.version,'measurement_id',md5('star-test-metric-v1:'||g.k)::uuid,'measurement_label',g.metric,'answer_type',g.kind,'unit',g.unit,'activity',g.activity,'frequency','when_occurs','report_mode','summary',
 'value',case when g.k='community' then (15+(d.n%4)*15)::text
 when g.k='snack' then case d.n%3 when 0 then 'FICTIONAL: Jamie chose fruit, washed it with a reminder, and placed it in a bowl.' when 1 then 'FICTIONAL: Jamie spread a topping using a visual checklist and asked for help opening the jar.' else 'FICTIONAL: Jamie chose crackers and helped clear the counter after preparing the snack.' end
 else case d.n%4 when 0 then 'Happy' when 1 then 'Calm' when 2 then 'Tired' else 'Unsure' end end) order by g.k) as answers
 from dates d cross join demo_isa_report_goals g join public.star_isa_outcomes c on c.id=md5('star-test-isa-v1:'||g.k)::uuid
 group by d.day,d.n
)
insert into public.caregiver_checkins(id,user_id,group_id,caregiver_name,date,payload,submitted_at,created_at,caregiver_notes)
select md5('star-test-isa-evidence-v1:'||day::text)::uuid,'00110000-0000-4000-8000-000000000002','89d4a593-2e74-48fc-9104-d6112498a3e9','Casey Green — Fictional Caregiver',day,
 jsonb_build_object('fixture_set','test-team-isa-v1','fictional_test_data',true,'entry_date',day::text,'individual_id','00110000-0000-4000-8000-000000000001','individual_name','Jamie Rivers — Fictional Individual','caregiver_name','Casey Green — Fictional Caregiver','isa_entries',answers,'caregiver_notes','FICTIONAL: Supplemental ISA activity observation; this is a separate practice session, not another daily shift.'),
 (day::timestamp+interval '14 hours') at time zone 'America/New_York',(day::timestamp+interval '14 hours') at time zone 'America/New_York',
 'FICTIONAL: Supplemental ISA activity observation; this is a separate practice session, not another daily shift.'
from evidence on conflict(id) do nothing;
insert into public.star_individual_observations_test(id,group_id,individual_id,author_user_id,original_words,response_choice,support_kind,review_status,linked_outcome_id,linked_outcome_version,reviewed_by,reviewed_at,reviewer_note,created_at)
select md5('star-test-isa-voice-v1:'||k)::uuid,'89d4a593-2e74-48fc-9104-d6112498a3e9','00110000-0000-4000-8000-000000000001','00110000-0000-4000-8000-000000000001',
 case k when 'community' then 'FICTIONAL: I picked the library. I liked choosing a book.' when 'snack' then 'FICTIONAL: I made my snack. Someone helped with the jar.' else 'FICTIONAL: I told my team I felt tired and wanted a quiet break.' end,
 'I tried something','Helper read choices','linked_observation',md5('star-test-isa-v1:'||k)::uuid,1,'00110000-0000-4000-8000-000000000004','2026-11-08T18:00:00Z','FICTIONAL DEMO REVIEW by synthetic Sam Parker. Relevance only; not a success rating.','2026-11-07T18:00:00Z'
from demo_isa_report_goals on conflict(id) do nothing;
insert into public.star_individual_checkins_test(id,group_id,individual_id,author_user_id,checkin_date,response_type,response_value,original_words,offered_options,support_kind,is_fictional,demo_source_key,created_at) values
 (md5('star-test-isa-feedback-v1:liked')::uuid,'89d4a593-2e74-48fc-9104-d6112498a3e9','00110000-0000-4000-8000-000000000001','00110000-0000-4000-8000-000000000001','2026-11-08','daily_experience','Liked it','FICTIONAL: I liked picking my own snack.','["Liked it","Okay","Did not like"]','Helper read choices',true,'test-team-isa-feedback-v1:liked','2026-11-08T18:00:00Z'),
 (md5('star-test-isa-feedback-v1:disliked')::uuid,'89d4a593-2e74-48fc-9104-d6112498a3e9','00110000-0000-4000-8000-000000000001','00110000-0000-4000-8000-000000000001','2026-11-06','daily_experience','Did not like','FICTIONAL: The shop was too busy. I wanted somewhere quieter.','["Liked it","Okay","Did not like"]','Helper read choices',true,'test-team-isa-feedback-v1:disliked','2026-11-06T18:00:00Z'),
 (md5('star-test-isa-feedback-v1:choice')::uuid,'89d4a593-2e74-48fc-9104-d6112498a3e9','00110000-0000-4000-8000-000000000001','00110000-0000-4000-8000-000000000001','2026-11-04','leisure_preference','Music','FICTIONAL: I want music today.','["Music","Drawing"]','not_reported',true,'test-team-isa-feedback-v1:choice','2026-11-04T18:00:00Z') on conflict(id) do nothing;
commit;
