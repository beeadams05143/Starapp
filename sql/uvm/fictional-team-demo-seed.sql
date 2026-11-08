-- STAR Test Database ONLY. Disabled synthetic accounts; no passwords or invitations.
begin;
do $$ begin
 if not exists(select 1 from public.groups where id='89d4a593-2e74-48fc-9104-d6112498a3e9' and name='Test') then raise exception 'Expected UVM Test group missing'; end if;
end $$;
create temporary table demo_team_seed(id uuid,name text,team_role text) on commit drop;
insert into demo_team_seed values
('00110000-0000-4000-8000-000000000001','Jamie Rivers — Fictional Individual','individual'),
('00110000-0000-4000-8000-000000000002','Casey Green — Fictional Caregiver','caregiver'),
('00110000-0000-4000-8000-000000000003','Robin Ellis — Fictional Case Manager','case_manager'),
('00110000-0000-4000-8000-000000000004','Sam Parker — Fictional Administrator','administrator');
insert into auth.users(id,aud,role,email,banned_until,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated','star-demo-'||right(id::text,12)||'@example.invalid','infinity'::timestamptz,
'{"provider":"email","providers":["email"],"fictional_demo":true}'::jsonb,jsonb_build_object('full_name',name),now(),now()
from demo_team_seed on conflict(id) do nothing;
insert into public.profiles(id,group_id,default_group_id,full_name,public_name,display_name,role,onboarding_complete)
select id,'89d4a593-2e74-48fc-9104-d6112498a3e9','89d4a593-2e74-48fc-9104-d6112498a3e9',name,name,name,
case when team_role='individual' then 'individual' else 'caregiver' end,true from demo_team_seed on conflict(id) do nothing;
insert into public.group_members(group_id,user_id,role,team_role)
select '89d4a593-2e74-48fc-9104-d6112498a3e9',id,case when team_role='administrator' then 'admin' else 'member' end,team_role
from demo_team_seed on conflict(group_id,user_id) do nothing;
insert into public.star_moments_test_people(group_id,individual_id) values('89d4a593-2e74-48fc-9104-d6112498a3e9','00110000-0000-4000-8000-000000000001') on conflict do nothing;
commit;
