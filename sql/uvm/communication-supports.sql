-- TEST PROJECT ONLY. No personal plan content or seeded preferences.
create or replace function star_sandbox.communication_access(p_group uuid,p_person uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select star_sandbox.is_member(p_group) and (p_person=(select auth.uid()) or not exists (
 select 1 from public.star_moments_test_people p where p.group_id=p_group and p.individual_id=(select auth.uid())));
$$;
revoke all on function star_sandbox.communication_access(uuid,uuid) from public,anon;
grant execute on function star_sandbox.communication_access(uuid,uuid) to authenticated;

create table public.communication_guides_test (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null,
 individual_id uuid not null,
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=100000),
 expected_version integer not null default 0,
 version integer not null,
 recorded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(group_id,individual_id) references public.star_moments_test_people(group_id,individual_id),
 unique(group_id,individual_id,version)
);
create index communication_guides_person on public.communication_guides_test(group_id,individual_id,version desc);
create or replace function star_sandbox.communication_guide_stamp() returns trigger
language plpgsql security invoker set search_path='' as $$
declare current_version integer;
begin
 if auth.uid() is null then raise exception 'Sign in to save a guide'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.group_id::text||new.individual_id::text,0));
 select coalesce(max(version),0) into current_version from public.communication_guides_test where group_id=new.group_id and individual_id=new.individual_id;
 if new.expected_version<>current_version then raise exception 'The guide changed. Reload before publishing.'; end if;
 new.version=current_version+1;new.recorded_by=auth.uid();new.created_at=now();return new;
end $$;
revoke all on function star_sandbox.communication_guide_stamp() from public,anon,authenticated;
create trigger communication_guide_stamp before insert on public.communication_guides_test for each row execute function star_sandbox.communication_guide_stamp();
alter table public.communication_guides_test enable row level security;
revoke all on public.communication_guides_test from public,anon,authenticated;
grant select on public.communication_guides_test to authenticated;
grant insert(id,group_id,individual_id,content,expected_version) on public.communication_guides_test to authenticated;
create policy communication_guides_read on public.communication_guides_test for select to authenticated using(star_sandbox.communication_access(group_id,individual_id));
create policy communication_guides_publish on public.communication_guides_test for insert to authenticated with check(star_sandbox.communication_access(group_id,individual_id) and star_sandbox.is_admin(group_id) and recorded_by=(select auth.uid()));

create table public.communication_entries_test (
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
 foreign key(group_id,individual_id) references public.star_moments_test_people(group_id,individual_id)
);
create index communication_entries_person on public.communication_entries_test(group_id,individual_id,created_at desc);
create index communication_entries_recorder on public.communication_entries_test(recorded_by);
create index communication_entries_reviewer on public.communication_entries_test(reviewed_by);
create or replace function star_sandbox.communication_entry_stamp() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to save'; end if;
 if tg_op='INSERT' then
 new.recorded_by=auth.uid();new.shared_device=(new.individual_id<>auth.uid());new.created_at=now();new.reviewed_by=null;new.reviewed_at=null;
 else
 new.reviewed_by=auth.uid();new.reviewed_at=now();
 end if;return new;
end $$;
revoke all on function star_sandbox.communication_entry_stamp() from public,anon,authenticated;
create trigger communication_entry_stamp before insert or update on public.communication_entries_test for each row execute function star_sandbox.communication_entry_stamp();
alter table public.communication_entries_test enable row level security;
revoke all on public.communication_entries_test from public,anon,authenticated;
grant select on public.communication_entries_test to authenticated;
grant insert(id,group_id,individual_id,kind,content) on public.communication_entries_test to authenticated;
grant update(reviewed_at) on public.communication_entries_test to authenticated;
create policy communication_entries_read on public.communication_entries_test for select to authenticated using(star_sandbox.communication_access(group_id,individual_id));
create policy communication_entries_add on public.communication_entries_test for insert to authenticated with check(
 recorded_by=(select auth.uid()) and star_sandbox.communication_access(group_id,individual_id) and
 (kind='individual' or not exists(select 1 from public.star_moments_test_people p where p.group_id=communication_entries_test.group_id and p.individual_id=(select auth.uid())))
);
create policy communication_entries_review on public.communication_entries_test for update to authenticated
 using(star_sandbox.communication_access(group_id,individual_id) and star_sandbox.is_admin(group_id))
 with check(star_sandbox.communication_access(group_id,individual_id) and star_sandbox.is_admin(group_id) and reviewed_by=(select auth.uid()));
notify pgrst,'reload schema';
