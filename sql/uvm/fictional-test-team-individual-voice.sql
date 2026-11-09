-- UVM rjozzwmkvlndanoaghtc ONLY: optional self-report fixtures, never real answers.
-- Additive, repeatable, and scoped to the Test team's disabled synthetic Jamie.
begin;
do $$ begin
 if not exists(select 1 from public.group_members where group_id='89d4a593-2e74-48fc-9104-d6112498a3e9' and user_id='00110000-0000-4000-8000-000000000001' and team_role='individual')
 or not exists(select 1 from auth.users where id='00110000-0000-4000-8000-000000000001' and raw_app_meta_data->>'fictional_demo'='true' and banned_until='infinity'::timestamptz)
 then raise exception 'Expected UVM fictional individual missing'; end if;
end $$;
with dates as (
 select day::date as day,(day::date-date '2026-10-01')/2 as n
 from generate_series(date '2026-10-01',date '2026-11-08',interval '2 days') day
), samples as (
 select d.*,v.kind,
 case v.kind when 'mood' then (array['Happy','Okay','Tired','Calm'])[1+n%4]
 when 'daily_experience' then (array['Liked it','Okay','Did not like','Liked it','Not today'])[1+n%5]
 when 'leisure_preference' then (array['Music','Drawing','Walk','Quiet break'])[1+n%4]
 else (array['Head','Stomach'])[1+n%2] end as choice,
 case v.kind when 'mood' then (array['FICTIONAL: I feel happy after choosing my music.','FICTIONAL: I feel okay today.','FICTIONAL: I am tired and want a break.','FICTIONAL: I feel calm with quiet time.'])[1+n%4]
 when 'daily_experience' then (array['FICTIONAL: Library visit','FICTIONAL: Walk in the park','FICTIONAL: Busy shop — I wanted somewhere quieter','FICTIONAL: Drawing at home','FICTIONAL: I chose not to do an activity today'])[1+n%5]
 when 'leisure_preference' then 'FICTIONAL: This is the activity I would choose today.'
 else 'FICTIONAL: I pointed to where I felt uncomfortable and asked my helper.' end as words
 from dates d cross join (values('mood'),('daily_experience'),('leisure_preference'),('comfort')) v(kind)
 where v.kind<>'comfort' or n%3=0
)
insert into public.star_individual_checkins_test(id,group_id,individual_id,author_user_id,checkin_date,response_type,response_value,original_words,offered_options,support_kind,is_fictional,demo_source_key,created_at)
select md5('star-test-voice-v2:'||day::text||':'||kind)::uuid,'89d4a593-2e74-48fc-9104-d6112498a3e9','00110000-0000-4000-8000-000000000001','00110000-0000-4000-8000-000000000001',day,kind,choice,words,
 case kind when 'mood' then '["Happy","Okay","Tired","Calm"]'::jsonb when 'daily_experience' then '["Liked it","Okay","Did not like","Not today"]'::jsonb when 'leisure_preference' then '["Music","Drawing","Walk","Quiet break"]'::jsonb else '["Head","Stomach"]'::jsonb end,
 case when n%2=0 then 'Helper read choices' else 'not_reported' end,true,'test-team-voice-v2:'||day::text||':'||kind,
 (day::timestamp+interval '16 hours') at time zone 'America/New_York'
from samples on conflict(id) do nothing;
commit;
