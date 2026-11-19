-- Production My STAR. Existing groups and memberships remain the source of access.
create schema star_individual;
revoke all on schema star_individual from public, anon;
grant usage on schema star_individual to authenticated;

create function star_individual.is_member(g uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.group_members where group_id=g and user_id=(select auth.uid()));
$$;
create function star_individual.is_admin(g uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.group_members where group_id=g and user_id=(select auth.uid()) and role='admin');
$$;
revoke all on function star_individual.is_member(uuid),star_individual.is_admin(uuid) from public,anon;
grant execute on function star_individual.is_member(uuid),star_individual.is_admin(uuid) to authenticated;

create table public.star_individual_people (
  group_id uuid not null,
  individual_id uuid not null,
  primary key(group_id,individual_id),
  foreign key(group_id,individual_id) references public.group_members(group_id,user_id) on delete cascade
);
alter table public.star_individual_people enable row level security;
revoke all on public.star_individual_people from public,anon,authenticated;
grant select on public.star_individual_people to authenticated;

-- Enroll current and future Individual accounts with real group memberships.
-- An enrolled Individual cannot become a supporter by editing a profile setting.
insert into public.star_individual_people(group_id,individual_id)
select m.group_id,m.user_id from public.group_members m join public.profiles p on p.id=m.user_id
where p.role='individual';
create function star_individual.enroll_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.id=auth.uid() or auth.uid() is null then
    if new.role='individual' then
      insert into public.star_individual_people(group_id,individual_id)
      select m.group_id,m.user_id from public.group_members m where m.user_id=new.id on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
create function star_individual.enroll_membership() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.user_id=auth.uid() or auth.uid() is null) and
     exists(select 1 from public.profiles p where p.id=new.user_id and p.role='individual') then
    insert into public.star_individual_people(group_id,individual_id)
    values(new.group_id,new.user_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function star_individual.enroll_profile(),star_individual.enroll_membership() from public,anon,authenticated;
create trigger star_individual_enroll_profile after insert or update of role on public.profiles
for each row execute function star_individual.enroll_profile();
create trigger star_individual_enroll_membership after insert on public.group_members
for each row execute function star_individual.enroll_membership();

create function star_individual.is_supporter(g uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from public.group_members m
    join public.profiles p on p.id=m.user_id
    where m.group_id=g and m.user_id=auth.uid() and (m.role='admin' or p.role='caregiver')
  ) and not exists (
    select 1 from public.star_individual_people where group_id=g and individual_id=auth.uid()
  );
$$;
revoke all on function star_individual.is_supporter(uuid) from public,anon;
grant execute on function star_individual.is_supporter(uuid) to authenticated;
create policy individual_roster_read on public.star_individual_people for select to authenticated
using (star_individual.is_member(group_id) and (individual_id=(select auth.uid()) or star_individual.is_supporter(group_id)));

create function star_individual.can_access(g uuid,p uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.star_individual_people where group_id=g and individual_id=p);
$$;
revoke all on function star_individual.can_access(uuid,uuid) from public,anon;
grant execute on function star_individual.can_access(uuid,uuid) to authenticated;

-- Chat already powers STAR Live. Require family membership even for older permissive policies.
create policy individual_chat_member_read on public.messages as restrictive for select
using (exists(select 1 from public.group_members m where m.group_id=messages.group_id and m.user_id=(select auth.uid())));
create policy individual_chat_member_insert on public.messages as restrictive for insert
with check (sender_id=(select auth.uid()) and exists(select 1 from public.group_members m where m.group_id=messages.group_id and m.user_id=(select auth.uid())));
create policy individual_chat_member_update on public.messages as restrictive for update
using (sender_id=(select auth.uid()) and exists(select 1 from public.group_members m where m.group_id=messages.group_id and m.user_id=(select auth.uid())))
with check (sender_id=(select auth.uid()) and exists(select 1 from public.group_members m where m.group_id=messages.group_id and m.user_id=(select auth.uid())));
create policy individual_chat_member_delete on public.messages as restrictive for delete
using (sender_id=(select auth.uid()) and exists(select 1 from public.group_members m where m.group_id=messages.group_id and m.user_id=(select auth.uid())));
alter table public.messages add column my_star_request_id uuid unique;

create table public.star_moments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  individual_id uuid not null references auth.users(id),
  caregiver_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  label text not null check(length(trim(label)) between 1 and 100),
  category text not null check(category in ('Work','Community','Home','Learning','Fun/Leisure','Other')),
  photo text not null check(length(photo)<1400000 and photo ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')
);
create index star_moments_person_date on public.star_moments(group_id,individual_id,created_at desc);
create table public.star_moment_notes (
  moment_id uuid primary key references public.star_moments(id) on delete cascade,
  observation text not null check(observation in ('Seemed to enjoy it','Unsure','Seemed uncomfortable')),
  note text not null default '' check(length(note)<=500)
);
create table public.star_moment_responses (
  moment_id uuid primary key references public.star_moments(id) on delete cascade,
  recorded_by uuid not null default auth.uid() references auth.users(id),
  reviewed_at timestamptz not null default now(),
  satisfaction text not null check(satisfaction in ('I liked it','It was okay','I didn’t like it','I’m not sure','Not now','In my own words')),
  again text check(again in ('Yes','No','I’m not sure')),
  words text not null default '' check(length(words)<=2000),
  support text check(support in ('Answered independently','Answered after seeing choices','Answered with caregiver assistance')),
  check(satisfaction<>'Not now' or (again is null and support is null and words='')),
  check(satisfaction<>'In my own words' or length(trim(words))>0)
);
alter table public.star_moments enable row level security;
alter table public.star_moment_notes enable row level security;
alter table public.star_moment_responses enable row level security;
revoke all on public.star_moments,public.star_moment_notes,public.star_moment_responses from public,anon,authenticated;
grant select on public.star_moments,public.star_moment_notes,public.star_moment_responses to authenticated;
grant insert(id,group_id,individual_id,label,category,photo) on public.star_moments to authenticated;
grant insert(moment_id,observation,note) on public.star_moment_notes to authenticated;
grant insert(moment_id,satisfaction,again,words,support),update(satisfaction,again,words,support) on public.star_moment_responses to authenticated;
create policy star_moments_read on public.star_moments for select to authenticated
using(star_individual.can_access(group_id,individual_id));
create policy star_moments_add on public.star_moments for insert to authenticated
with check(caregiver_id=(select auth.uid()) and star_individual.can_access(group_id,individual_id) and star_individual.is_supporter(group_id));
create policy star_moment_notes_read on public.star_moment_notes for select to authenticated
using(exists(select 1 from public.star_moments m where m.id=moment_id and star_individual.is_supporter(m.group_id)));
create policy star_moment_notes_add on public.star_moment_notes for insert to authenticated
with check(exists(select 1 from public.star_moments m where m.id=moment_id and m.caregiver_id=(select auth.uid()) and star_individual.is_supporter(m.group_id)));
create policy star_moment_response_read on public.star_moment_responses for select to authenticated
using(exists(select 1 from public.star_moments m where m.id=moment_id));
create policy star_moment_response_add on public.star_moment_responses for insert to authenticated
with check(recorded_by=(select auth.uid()) and exists(select 1 from public.star_moments m where m.id=moment_id));
create policy star_moment_response_retry on public.star_moment_responses for update to authenticated
using(satisfaction='Not now' and exists(select 1 from public.star_moments m where m.id=moment_id))
with check(recorded_by=(select auth.uid()) and exists(select 1 from public.star_moments m where m.id=moment_id));
create function star_individual.stamp_moment_response() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  new.recorded_by:=auth.uid();
  new.reviewed_at:=now();
  return new;
end;
$$;
revoke all on function star_individual.stamp_moment_response() from public,anon,authenticated;
create trigger star_moment_response_stamp before insert or update on public.star_moment_responses
for each row execute function star_individual.stamp_moment_response();

create function public.star_add_moment(moment uuid,team uuid,person uuid,activity text,kind text,image text,observed text,detail text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  insert into public.star_moments(id,group_id,individual_id,label,category,photo)
  values(moment,team,person,activity,kind,image);
  if observed<>'' then
    insert into public.star_moment_notes(moment_id,observation,note) values(moment,observed,coalesce(detail,''));
  end if;
end;
$$;
revoke all on function public.star_add_moment(uuid,uuid,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.star_add_moment(uuid,uuid,uuid,text,text,text,text,text) to authenticated;

-- Self-reports are not caregiver observations, ISA achievement, or emergency alerts.
create table if not exists public.star_individual_checkins (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  individual_id text not null default '',
  author_user_id uuid not null default auth.uid(),
  checkin_date date not null default current_date,
  response_type text not null check (response_type in ('mood','comfort','daily_experience','leisure_preference')),
  response_value text not null check (length(btrim(response_value)) between 1 and 500),
  original_words text not null default '' check (length(original_words) <= 2000),
  offered_options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(offered_options) = 'array' and jsonb_array_length(offered_options) <= 20),
  support_kind text not null default 'not_reported' check (length(support_kind) <= 160),
  created_at timestamptz not null default now()
);
create index if not exists star_individual_checkins_group_date
  on public.star_individual_checkins(group_id,checkin_date desc,created_at desc);
alter table public.star_individual_checkins enable row level security;
revoke all on public.star_individual_checkins from anon, public, authenticated;
grant select, insert on public.star_individual_checkins to authenticated;
create policy star_live_self_reports_read on public.star_individual_checkins
for select to authenticated
using (star_individual.is_member(group_id) and (author_user_id=(select auth.uid()) or star_individual.is_supporter(group_id)));
create policy star_live_self_reports_insert on public.star_individual_checkins
for insert to authenticated
with check (
  author_user_id = (select auth.uid())
  and star_individual.is_member(group_id)
  and individual_id = (select auth.uid())::text
  and star_individual.can_access(group_id,(select auth.uid()))
);


create table if not exists public.star_individual_observations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  individual_id text not null default '',
  author_user_id uuid not null default auth.uid() references auth.users(id),
  original_words text not null check (char_length(btrim(original_words)) between 1 and 2000),
  expression_type text not null default 'accomplishment' check (expression_type in ('accomplishment','preference')),
  response_choice text not null default '',
  support_kind text not null default 'not_reported',
  possible_matches jsonb not null default '[]'::jsonb check (jsonb_typeof(possible_matches)='array' and jsonb_array_length(possible_matches)<=5),
  review_status text not null default 'pending' check (review_status in ('pending','linked_observation','needs_details','unlinked')),
  linked_outcome_id uuid references public.star_isa_outcomes(id),
  linked_outcome_version integer,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  reviewer_note text not null default '' check (char_length(reviewer_note)<=2000),
  created_at timestamptz not null default now(),
  constraint star_live_link_is_reviewed check (
    (review_status='linked_observation' and linked_outcome_id is not null and linked_outcome_version is not null) or
    (review_status<>'linked_observation' and linked_outcome_id is null and linked_outcome_version is null)
  )
);
create index if not exists star_live_observation_queue on public.star_individual_observations (group_id,review_status,created_at desc);
create or replace function star_individual.star_live_observations_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_version integer;
begin
  if tg_op='UPDATE' then
    if new.group_id is distinct from old.group_id
       or new.individual_id is distinct from old.individual_id
       or new.author_user_id is distinct from old.author_user_id
       or new.original_words is distinct from old.original_words
       or new.expression_type is distinct from old.expression_type
       or new.response_choice is distinct from old.response_choice
       or new.support_kind is distinct from old.support_kind
       or new.possible_matches is distinct from old.possible_matches
       or new.created_at is distinct from old.created_at then
      raise exception 'Original individual self-report is immutable';
    end if;
    if new.review_status='pending' then
      new.reviewed_by:=null; new.reviewed_at:=null;
    else
      new.reviewed_by:=(select auth.uid());
      new.reviewed_at:=now();
    end if;
  end if;
  if new.review_status='linked_observation' then
    select version into v_version from public.star_isa_outcomes
      where id=new.linked_outcome_id and group_id=new.group_id and individual_id=new.individual_id;
    if v_version is null then raise exception 'Linked ISA card must belong to this group and individual'; end if;
    new.linked_outcome_version:=v_version;
  else
    new.linked_outcome_id:=null;
    new.linked_outcome_version:=null;
  end if;
  return new;
end;
$$;
revoke all on function star_individual.star_live_observations_guard() from public,anon,authenticated;
drop trigger if exists star_live_observations_guard_write on public.star_individual_observations;
create trigger star_live_observations_guard_write before insert or update
on public.star_individual_observations for each row execute function star_individual.star_live_observations_guard();

alter table public.star_individual_observations enable row level security;
revoke all on public.star_individual_observations from public,anon,authenticated;
grant select,insert,update on public.star_individual_observations to authenticated;
create policy star_live_observations_read on public.star_individual_observations
 for select to authenticated
 using (star_individual.is_member(group_id) and (author_user_id=(select auth.uid()) or (star_individual.is_admin(group_id) and star_individual.is_supporter(group_id))));
create policy star_live_observations_insert on public.star_individual_observations
 for insert to authenticated
 with check (author_user_id=(select auth.uid()) and star_individual.is_member(group_id)
   and individual_id=(select auth.uid())::text and star_individual.can_access(group_id,(select auth.uid()))
   and review_status='pending' and linked_outcome_id is null
   and linked_outcome_version is null and reviewed_by is null and reviewed_at is null and reviewer_note='');
create policy star_live_observations_admin_update on public.star_individual_observations
 for update to authenticated
 using (star_individual.is_admin(group_id) and star_individual.is_supporter(group_id))
 with check (star_individual.is_admin(group_id) and star_individual.is_supporter(group_id));


create or replace function star_individual.communication_access(p_group uuid,p_person uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select star_individual.can_access(p_group,p_person);
$$;
revoke all on function star_individual.communication_access(uuid,uuid) from public,anon;
grant execute on function star_individual.communication_access(uuid,uuid) to authenticated;

create table public.communication_guides (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null,
 individual_id uuid not null,
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=100000),
 expected_version integer not null default 0,
 version integer not null,
 recorded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(group_id,individual_id) references public.star_individual_people(group_id,individual_id),
 unique(group_id,individual_id,version)
);
create index communication_guides_person on public.communication_guides(group_id,individual_id,version desc);
create or replace function star_individual.communication_guide_stamp() returns trigger
language plpgsql security invoker set search_path='' as $$
declare current_version integer;
begin
 if auth.uid() is null then raise exception 'Sign in to save a guide'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.group_id::text||new.individual_id::text,0));
 select coalesce(max(version),0) into current_version from public.communication_guides where group_id=new.group_id and individual_id=new.individual_id;
 if new.expected_version<>current_version then raise exception 'The guide changed. Reload before publishing.'; end if;
 new.version=current_version+1;new.recorded_by=auth.uid();new.created_at=now();return new;
end $$;
revoke all on function star_individual.communication_guide_stamp() from public,anon,authenticated;
create trigger communication_guide_stamp before insert on public.communication_guides for each row execute function star_individual.communication_guide_stamp();
alter table public.communication_guides enable row level security;
revoke all on public.communication_guides from public,anon,authenticated;
grant select on public.communication_guides to authenticated;
grant insert(id,group_id,individual_id,content,expected_version) on public.communication_guides to authenticated;
create policy communication_guides_read on public.communication_guides for select to authenticated using(star_individual.communication_access(group_id,individual_id));
create policy communication_guides_publish on public.communication_guides for insert to authenticated with check(star_individual.communication_access(group_id,individual_id) and star_individual.is_admin(group_id) and recorded_by=(select auth.uid()));

create table public.communication_entries (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null,
 individual_id uuid not null,
 kind text not null check(kind in ('individual','observation','suggestion')),
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=100000),
 recorded_by uuid not null references auth.users(id),
 shared_device boolean not null,
 created_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 foreign key(group_id,individual_id) references public.star_individual_people(group_id,individual_id)
);
create index communication_entries_person on public.communication_entries(group_id,individual_id,created_at desc);
create index communication_entries_recorder on public.communication_entries(recorded_by);
create index communication_entries_reviewer on public.communication_entries(reviewed_by);
create or replace function star_individual.communication_entry_stamp() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to save'; end if;
 if tg_op='INSERT' then
 new.recorded_by=auth.uid();new.shared_device=(new.individual_id<>auth.uid());new.created_at=now();new.reviewed_by=null;new.reviewed_at=null;
 else
 new.reviewed_by=auth.uid();new.reviewed_at=now();
 end if;return new;
end $$;
revoke all on function star_individual.communication_entry_stamp() from public,anon,authenticated;
create trigger communication_entry_stamp before insert or update on public.communication_entries for each row execute function star_individual.communication_entry_stamp();
alter table public.communication_entries enable row level security;
revoke all on public.communication_entries from public,anon,authenticated;
grant select on public.communication_entries to authenticated;
grant insert(id,group_id,individual_id,kind,content) on public.communication_entries to authenticated;
grant update(reviewed_at) on public.communication_entries to authenticated;
create policy communication_entries_read on public.communication_entries for select to authenticated using(star_individual.communication_access(group_id,individual_id));
create policy communication_entries_add on public.communication_entries for insert to authenticated with check(
 recorded_by=(select auth.uid()) and star_individual.communication_access(group_id,individual_id) and
 (kind='individual' or not exists(select 1 from public.star_individual_people p where p.group_id=communication_entries.group_id and p.individual_id=(select auth.uid())))
);
create policy communication_entries_review on public.communication_entries for update to authenticated
 using(star_individual.communication_access(group_id,individual_id) and star_individual.is_admin(group_id))
 with check(star_individual.communication_access(group_id,individual_id) and star_individual.is_admin(group_id) and reviewed_by=(select auth.uid()));
notify pgrst,'reload schema';

create or replace function star_individual.support_preparation_access(g uuid,p uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select star_individual.can_access(g,p);
$$;
revoke all on function star_individual.support_preparation_access(uuid,uuid) from public,anon;
grant execute on function star_individual.support_preparation_access(uuid,uuid) to authenticated;
create table public.support_preparation_topics(
 id uuid primary key default gen_random_uuid(),group_id uuid not null,individual_id uuid not null,
 label text not null check(length(trim(label)) between 1 and 240),
 recorded_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 foreign key(group_id,individual_id) references public.star_individual_people(group_id,individual_id),
 unique(id,group_id,individual_id)
);
alter table public.support_preparation_topics enable row level security;
revoke all on public.support_preparation_topics from public,anon,authenticated;
grant select on public.support_preparation_topics to authenticated;
grant insert(id,group_id,individual_id,label) on public.support_preparation_topics to authenticated;
create policy preparation_topics_read on public.support_preparation_topics for select to authenticated using(star_individual.support_preparation_access(group_id,individual_id));
create policy preparation_topics_add on public.support_preparation_topics for insert to authenticated with check(star_individual.support_preparation_access(group_id,individual_id) and recorded_by=(select auth.uid()));
create index preparation_topics_scope on public.support_preparation_topics(group_id,individual_id);
create index preparation_topics_author on public.support_preparation_topics(recorded_by);
create table public.support_preparation_entries(
 id uuid primary key default gen_random_uuid(),group_id uuid not null,individual_id uuid not null,
 field_id text not null,topic_id uuid,
 perspective text not null check(perspective in ('individual','team')),
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=60000),
 source_refs jsonb not null default '[]' check(jsonb_typeof(source_refs)='array' and jsonb_array_length(source_refs)<=10),
 source_snapshots jsonb not null default '[]',recorded_by uuid not null references auth.users(id),shared_device boolean not null,
 created_at timestamptz not null default now(),
 foreign key(group_id,individual_id) references public.star_individual_people(group_id,individual_id),
 foreign key(topic_id,group_id,individual_id) references public.support_preparation_topics(id,group_id,individual_id),
 check(field_id in ('s1q1','s1q2','s1q3','s2q1','s2q2','s2q3','s3q1','s3q2','s3q3','s4q1','s4q2','s4q3','s5q1','s6q1','s7q1','s7q2','s1q4','s1q5','s2q4','s2q5','s3q4','s3q5','s3q6','s3q7','s3q8','s3q9','s3q10','s3q11','s3q12','s4q4','s4q5','s4q6','s4q7','s4q8')),
 check((field_id like 's4q%' and topic_id is not null) or (field_id not like 's4q%' and topic_id is null))
);
create index preparation_entries_scope on public.support_preparation_entries(group_id,individual_id,created_at desc);
create index preparation_entries_author on public.support_preparation_entries(recorded_by);
create index preparation_entries_topic on public.support_preparation_entries(topic_id,group_id,individual_id);
create or replace function star_individual.support_preparation_stamp() returns trigger
language plpgsql security invoker set search_path='' as $$
declare ref jsonb;snapshot jsonb; snapshots jsonb:='[]';
begin
 if auth.uid() is null then raise exception 'Sign in before saving';end if;
 new.recorded_by=auth.uid();new.shared_device=(new.individual_id<>auth.uid());new.created_at=now();
 for ref in select value from jsonb_array_elements(new.source_refs) loop
 snapshot=null;
 if ref->>'kind'='communication' then
 select jsonb_build_object('kind','communication','id',c.id,'date',c.created_at,'recorder',c.recorded_by,'content',c.content) into snapshot from public.communication_entries c where c.id=(ref->>'id')::uuid and c.group_id=new.group_id and c.individual_id=new.individual_id;
 elsif ref->>'kind'='guide' then
 select jsonb_build_object('kind','guide','id',c.id,'date',c.created_at,'recorder',c.recorded_by,'version',c.version,'content',c.content) into snapshot from public.communication_guides c where c.id=(ref->>'id')::uuid and c.group_id=new.group_id and c.individual_id=new.individual_id;
 elsif ref->>'kind'='checkin' and star_individual.is_supporter(new.group_id) then
 -- A group match alone is insufficient; unassigned legacy records are excluded.
 select jsonb_build_object('kind','checkin','id',c.id,'date',c.date,'recorder',c.user_id,'content',jsonb_build_object('caregiver_notes',coalesce(c.payload->>'caregiver_notes',c.caregiver_notes),'physical_notes',c.payload->>'physical_notes','behavior_notes',c.payload->>'behavior_notes','hours_sleep',c.payload->'hours_sleep')) into snapshot from public.caregiver_checkins c where c.id=(ref->>'id')::uuid and c.group_id=new.group_id and c.payload->>'individual_id'=new.individual_id::text;
 end if;
 if snapshot is null then raise exception 'Linked source is missing, inaccessible, or belongs to another individual';end if;
 snapshots=snapshots||jsonb_build_array(snapshot);
 end loop;
 if octet_length(snapshots::text)>300000 then raise exception 'Select fewer source records';end if;
 new.source_snapshots=snapshots;return new;
end $$;
revoke all on function star_individual.support_preparation_stamp() from public,anon,authenticated;
create trigger support_preparation_stamp before insert on public.support_preparation_entries for each row execute function star_individual.support_preparation_stamp();
alter table public.support_preparation_entries enable row level security;
revoke all on public.support_preparation_entries from public,anon,authenticated;
grant select on public.support_preparation_entries to authenticated;
grant insert(id,group_id,individual_id,field_id,topic_id,perspective,content,source_refs) on public.support_preparation_entries to authenticated;
create policy preparation_entries_read on public.support_preparation_entries for select to authenticated using(star_individual.support_preparation_access(group_id,individual_id));
create policy preparation_entries_add on public.support_preparation_entries for insert to authenticated with check(star_individual.support_preparation_access(group_id,individual_id) and recorded_by=(select auth.uid()) and (perspective='individual' or (not exists(select 1 from public.star_individual_people p where p.group_id=support_preparation_entries.group_id and p.individual_id=(select auth.uid())) and star_individual.is_supporter(group_id))));
notify pgrst,'reload schema';

-- A self-report and its legacy mood entry succeed or fail together.
create function public.star_save_individual_checkin(
  request_id uuid, team uuid, care_date date, kind text, answer text, words text, choices jsonb, support text
) returns void language plpgsql security invoker set search_path='' as $$
declare inserted_id uuid;
begin
  insert into public.star_individual_checkins(
    id,group_id,individual_id,checkin_date,response_type,response_value,original_words,offered_options,support_kind
  ) values(request_id,team,auth.uid()::text,care_date,kind,answer,words,choices,support)
  on conflict(id) do nothing returning id into inserted_id;
  if inserted_id is not null and kind='mood' then
    insert into public.mood_entries(group_id,user_id,date,mood)
    values(team,auth.uid(),care_date,case answer
      when 'Happy' then '😊 Happy'
      when 'Okay' then '🙂 OK'
      when 'Sad' then '😢 Sad'
      when 'Upset' then '😠 Upset'
      when 'Tired' then '😴 Tired'
      when 'Unwell' then '🤒 Sick'
      else answer end);
  end if;
end;
$$;
revoke all on function public.star_save_individual_checkin(uuid,uuid,date,text,text,text,jsonb,text) from public,anon;
grant execute on function public.star_save_individual_checkin(uuid,uuid,date,text,text,text,jsonb,text) to authenticated;
notify pgrst,'reload schema';
