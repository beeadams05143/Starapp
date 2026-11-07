-- UVM testing: individuals may record their own experience while using an
-- authorized caregiver's signed-in device. recorded_by remains the actual user;
-- the subject is the individual_id on the linked moment. Do not impersonate them.
alter policy responses_add on public.star_moment_responses_test
  to authenticated with check (
    recorded_by = auth.uid() and exists (
      select 1 from public.star_moments_test m
      where m.id = star_moment_responses_test.moment_id
        and (m.individual_id = auth.uid() or (
          exists (select 1 from public.group_members gm
            where gm.group_id=m.group_id and gm.user_id=auth.uid())
          and not exists (select 1 from public.star_moments_test_people p
            where p.group_id=m.group_id and p.individual_id=auth.uid())
        ))
    )
  );
alter policy responses_retry on public.star_moment_responses_test
  to authenticated using (
    satisfaction='Not now' and exists (
      select 1 from public.star_moments_test m
      where m.id=star_moment_responses_test.moment_id
        and (m.individual_id=auth.uid() or (
          exists (select 1 from public.group_members gm
            where gm.group_id=m.group_id and gm.user_id=auth.uid())
          and not exists (select 1 from public.star_moments_test_people p
            where p.group_id=m.group_id and p.individual_id=auth.uid())
        ))
    )
  ) with check (
    recorded_by=auth.uid() and exists (
      select 1 from public.star_moments_test m
      where m.id=star_moment_responses_test.moment_id
        and (m.individual_id=auth.uid() or (
          exists (select 1 from public.group_members gm
            where gm.group_id=m.group_id and gm.user_id=auth.uid())
          and not exists (select 1 from public.star_moments_test_people p
            where p.group_id=m.group_id and p.individual_id=auth.uid())
        ))
    )
  );
alter table public.star_moment_responses_test
  drop constraint star_moment_responses_test_satisfaction_check;
alter table public.star_moment_responses_test
  add constraint star_moment_responses_test_satisfaction_check check (
    satisfaction in ('I liked it','It was okay','I didn’t like it','I’m not sure','Not now','In my own words')
    and (satisfaction<>'In my own words' or length(trim(words))>0)
  );

-- Keep recorder columns read-only to the client. The database stamps the real
-- signed-in recorder when an individual or caregiver finishes a deferred answer.
create or replace function star_sandbox.stamp_moment_response()
returns trigger language plpgsql set search_path='' as $$
begin
  new.reviewed_at=now();
  if auth.uid() is not null then new.recorded_by=auth.uid(); end if;
  return new;
end $$;
