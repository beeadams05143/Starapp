-- UVM testing only: a person's rating is sufficient. Unknown repeat preference
-- and unrecorded helper support remain NULL rather than inventing an answer.
alter table public.star_moment_responses_test
  drop constraint star_moment_responses_test_check;
alter table public.star_moment_responses_test
  add constraint star_moment_responses_test_check check (
    (satisfaction = 'Not now' and again is null and support is null and words = '')
    or
    (satisfaction <> 'Not now'
      and (again is null or again in ('Yes','No','I’m not sure'))
      and (support is null or support in (
        'Answered independently','Answered after seeing choices','Answered with caregiver assistance')))
  );
