-- UVM sandbox only. No personal plan content or fictional answers are seeded.
create or replace function star_sandbox.support_preparation_access(g uuid,p uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select star_sandbox.communication_access(g,p) and (p=(select auth.uid()) or not exists(select 1 from public.group_members m where m.group_id=g and m.user_id=(select auth.uid()) and m.team_role='individual'));
$$;
revoke all on function star_sandbox.support_preparation_access(uuid,uuid) from public,anon;
grant execute on function star_sandbox.support_preparation_access(uuid,uuid) to authenticated;
create table public.support_preparation_topics_test(
 id uuid primary key default gen_random_uuid(),group_id uuid not null,individual_id uuid not null,
 label text not null check(length(trim(label)) between 1 and 240),
 recorded_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 foreign key(group_id,individual_id) references public.star_moments_test_people(group_id,individual_id),
 unique(id,group_id,individual_id)
);
alter table public.support_preparation_topics_test enable row level security;
revoke all on public.support_preparation_topics_test from public,anon,authenticated;
grant select on public.support_preparation_topics_test to authenticated;
grant insert(id,group_id,individual_id,label) on public.support_preparation_topics_test to authenticated;
create policy preparation_topics_read on public.support_preparation_topics_test for select to authenticated using(star_sandbox.support_preparation_access(group_id,individual_id));
create policy preparation_topics_add on public.support_preparation_topics_test for insert to authenticated with check(star_sandbox.support_preparation_access(group_id,individual_id) and recorded_by=(select auth.uid()));
create index preparation_topics_scope on public.support_preparation_topics_test(group_id,individual_id);
create index preparation_topics_author on public.support_preparation_topics_test(recorded_by);
create table public.support_preparation_entries_test(
 id uuid primary key default gen_random_uuid(),group_id uuid not null,individual_id uuid not null,
 field_id text not null,topic_id uuid,
 perspective text not null check(perspective in ('individual','team')),
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=60000),
 source_refs jsonb not null default '[]' check(jsonb_typeof(source_refs)='array' and jsonb_array_length(source_refs)<=10),
 source_snapshots jsonb not null default '[]',recorded_by uuid not null references auth.users(id),shared_device boolean not null,
 created_at timestamptz not null default now(),
 foreign key(group_id,individual_id) references public.star_moments_test_people(group_id,individual_id),
 foreign key(topic_id,group_id,individual_id) references public.support_preparation_topics_test(id,group_id,individual_id),
 check(field_id in ('s1q1','s1q2','s1q3','s2q1','s2q2','s2q3','s3q1','s3q2','s3q3','s4q1','s4q2','s4q3','s5q1','s6q1','s7q1','s7q2','s1q4','s1q5','s2q4','s2q5','s3q4','s3q5','s3q6','s3q7','s3q8','s3q9','s3q10','s3q11','s3q12','s4q4','s4q5','s4q6','s4q7','s4q8')),
 check((field_id like 's4q%' and topic_id is not null) or (field_id not like 's4q%' and topic_id is null))
);
create index preparation_entries_scope on public.support_preparation_entries_test(group_id,individual_id,created_at desc);
create index preparation_entries_author on public.support_preparation_entries_test(recorded_by);
create index preparation_entries_topic on public.support_preparation_entries_test(topic_id,group_id,individual_id);
create or replace function star_sandbox.support_preparation_stamp() returns trigger
language plpgsql security invoker set search_path='' as $$
declare ref jsonb;snapshot jsonb; snapshots jsonb:='[]';
begin
 if auth.uid() is null then raise exception 'Sign in before saving';end if;
 new.recorded_by=auth.uid();new.shared_device=(new.individual_id<>auth.uid());new.created_at=now();
 for ref in select value from jsonb_array_elements(new.source_refs) loop
 snapshot=null;
 if ref->>'kind'='communication' then
 select jsonb_build_object('kind','communication','id',c.id,'date',c.created_at,'recorder',c.recorded_by,'content',c.content) into snapshot from public.communication_entries_test c where c.id=(ref->>'id')::uuid and c.group_id=new.group_id and c.individual_id=new.individual_id;
 elsif ref->>'kind'='guide' then
 select jsonb_build_object('kind','guide','id',c.id,'date',c.created_at,'recorder',c.recorded_by,'version',c.version,'content',c.content) into snapshot from public.communication_guides_test c where c.id=(ref->>'id')::uuid and c.group_id=new.group_id and c.individual_id=new.individual_id;
 elsif ref->>'kind'='checkin' then
 -- A group match alone is insufficient; unassigned legacy records are excluded.
 select jsonb_build_object('kind','checkin','id',c.id,'date',c.date,'recorder',c.user_id,'content',jsonb_build_object('caregiver_notes',coalesce(c.payload->>'caregiver_notes',c.caregiver_notes),'physical_notes',c.payload->>'physical_notes','behavior_notes',c.payload->>'behavior_notes','hours_sleep',c.payload->'hours_sleep')) into snapshot from public.caregiver_checkins c where c.id=(ref->>'id')::uuid and c.group_id=new.group_id and c.payload->>'individual_id'=new.individual_id::text;
 end if;
 if snapshot is null then raise exception 'Linked source is missing, inaccessible, or belongs to another individual';end if;
 snapshots=snapshots||jsonb_build_array(snapshot);
 end loop;
 if octet_length(snapshots::text)>300000 then raise exception 'Select fewer source records';end if;
 new.source_snapshots=snapshots;return new;
end $$;
revoke all on function star_sandbox.support_preparation_stamp() from public,anon,authenticated;
create trigger support_preparation_stamp before insert on public.support_preparation_entries_test for each row execute function star_sandbox.support_preparation_stamp();
alter table public.support_preparation_entries_test enable row level security;
revoke all on public.support_preparation_entries_test from public,anon,authenticated;
grant select on public.support_preparation_entries_test to authenticated;
grant insert(id,group_id,individual_id,field_id,topic_id,perspective,content,source_refs) on public.support_preparation_entries_test to authenticated;
create policy preparation_entries_read on public.support_preparation_entries_test for select to authenticated using(star_sandbox.support_preparation_access(group_id,individual_id));
create policy preparation_entries_add on public.support_preparation_entries_test for insert to authenticated with check(star_sandbox.support_preparation_access(group_id,individual_id) and recorded_by=(select auth.uid()) and (perspective='individual' or (not exists(select 1 from public.star_moments_test_people p where p.group_id=support_preparation_entries_test.group_id and p.individual_id=(select auth.uid())) and not exists(select 1 from public.group_members m where m.group_id=support_preparation_entries_test.group_id and m.user_id=(select auth.uid()) and m.team_role='individual'))));
notify pgrst,'reload schema';
