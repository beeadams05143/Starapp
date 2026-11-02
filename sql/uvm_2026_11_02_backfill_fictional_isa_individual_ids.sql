-- ONE-TIME UVM SANDBOX DATA REPAIR ONLY. NEVER run against live STAR.
-- Three historical fictional group-level cards were created with individual_id = ''.
-- They all belong to a group with exactly one registered individual.
-- Ownership remains immutable after this transaction. All row IDs,
-- measurement IDs, and historical ISA data are retained.
begin;
-- ALTER TRIGGER takes an exclusive table lock until commit: concurrent writes wait.
do $star_test_preflight$
declare n_cards integer; n_people integer;
begin
 select count(*) into n_cards
 from public.star_isa_outcomes
 where group_id='c40d0ac1-0122-46f6-b358-fac283287bb5'::uuid and individual_id='';
 select count(*) into n_people
 from public.group_members m
 join public.profiles p on p.id=m.user_id
 where m.group_id='c40d0ac1-0122-46f6-b358-fac283287bb5'::uuid and p.role='individual';
 if n_cards<>3 or n_people<>1 then
   raise exception 'UVM backfill preflight failed: expected 3 blank cards and 1 group individual, found % and %',n_cards,n_people;
 end if;
end $star_test_preflight$;
-- Preserve the AFTER UPDATE audit trigger and version history;
-- temporarily bypass only the BEFORE UPDATE ownership guard in this transaction.
alter table public.star_isa_outcomes disable trigger star_isa_outcomes_write;
do $star_test_update$
declare target_id text; n integer;
begin
 select p.id::text into strict target_id
 from public.group_members m join public.profiles p on p.id=m.user_id
 where m.group_id='c40d0ac1-0122-46f6-b358-fac283287bb5'::uuid and p.role='individual';
 update public.star_isa_outcomes
 set individual_id=target_id, version=version+1,updated_at=now()
 where group_id='c40d0ac1-0122-46f6-b358-fac283287bb5'::uuid and individual_id='';
 get diagnostics n=row_count;
 if n<>3 then raise exception 'UVM backfill rolled back: expected 3 updates, found %',n; end if;
end $star_test_update$;
alter table public.star_isa_outcomes enable trigger star_isa_outcomes_write;
commit;
