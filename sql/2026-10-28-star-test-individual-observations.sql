-- STAR TEST DATABASE ONLY: individual self-report candidate links, not progress awards.
-- Do not run on STAR Live. This is a separate test-only queue.
create table if not exists public.star_individual_observations_test (
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
  constraint star_test_link_is_reviewed check (
    (review_status='linked_observation' and linked_outcome_id is not null and linked_outcome_version is not null) or
    (review_status<>'linked_observation' and linked_outcome_id is null and linked_outcome_version is null)
  )
);
create index if not exists star_test_observation_queue on public.star_individual_observations_test (group_id,review_status,created_at desc);
create or replace function public.star_test_observations_guard()
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
revoke all on function public.star_test_observations_guard() from public,anon,authenticated;
drop trigger if exists star_test_observations_guard_write on public.star_individual_observations_test;
create trigger star_test_observations_guard_write before insert or update
on public.star_individual_observations_test for each row execute function public.star_test_observations_guard();

alter table public.star_individual_observations_test enable row level security;
revoke all on public.star_individual_observations_test from anon;
grant select,insert,update on public.star_individual_observations_test to authenticated;
create policy star_test_observations_read on public.star_individual_observations_test
 for select to authenticated
 using (star_sandbox.is_member(group_id) and (author_user_id=(select auth.uid()) or star_sandbox.is_admin(group_id)));
create policy star_test_observations_insert on public.star_individual_observations_test
 for insert to authenticated
 with check (author_user_id=(select auth.uid()) and star_sandbox.is_member(group_id)
   and review_status='pending' and linked_outcome_id is null
   and linked_outcome_version is null and reviewed_by is null and reviewed_at is null and reviewer_note='');
create policy star_test_observations_admin_update on public.star_individual_observations_test
 for update to authenticated
 using (star_sandbox.is_admin(group_id))
 with check (star_sandbox.is_admin(group_id));
comment on table public.star_individual_observations_test is
 'Fictional My STAR prototype: reviewable original self-reports; never consumed by ISA progress or provider reports.';
