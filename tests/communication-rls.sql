-- Integration checks in a rolled-back transaction. Fictional sandbox only.
begin;
select set_config('qa.group','c40d0ac1-0122-46f6-b358-fac283287bb5',true),
 set_config('qa.person','58d3ac51-3dc7-4ead-b22f-8cb5829a3bac',true),
 set_config('qa.other','490dbc4d-7fa6-40f0-a2c1-c0fa0d33a868',true),
 set_config('qa.admin','54a346e4-9952-452d-bfc2-67a2842b59c8',true),
 set_config('qa.caregiver','ff639dab-4c75-4573-ad15-cfd3a8538101',true),
 set_config('qa.outsider','cac4a01d-5595-49ff-b960-e502d7e044aa',true),
 set_config('qa.guide',gen_random_uuid()::text,true),
 set_config('qa.entry',gen_random_uuid()::text,true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.admin'),true);
do $$ declare v integer; begin
 select coalesce(max(version),0) into v from public.communication_guides_test where group_id=current_setting('qa.group')::uuid and individual_id=current_setting('qa.person')::uuid;
 insert into public.communication_guides_test(id,group_id,individual_id,content,expected_version) values(current_setting('qa.guide')::uuid,current_setting('qa.group')::uuid,current_setting('qa.person')::uuid,'{"quick":"Fictional QA guide"}',v);
 if not exists(select 1 from public.communication_guides_test where id=current_setting('qa.guide')::uuid and version=v+1 and recorded_by=auth.uid()) then raise exception 'Guide version/recorder failed';end if;
 begin
 insert into public.communication_guides_test(group_id,individual_id,content,expected_version) values(current_setting('qa.group')::uuid,current_setting('qa.person')::uuid,'{}',v);
 raise exception 'Stale guide version was accepted';
 exception when raise_exception then if sqlerrm not like 'The guide changed%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.caregiver'),true);
do $$ begin
 insert into public.communication_entries_test(id,group_id,individual_id,kind,content) values(current_setting('qa.entry')::uuid,current_setting('qa.group')::uuid,current_setting('qa.person')::uuid,'individual','{"answers":{"express":{"question":"QA","choices":["Talk"],"words":"Fictional answer"}}}');
 if not exists(select 1 from public.communication_entries_test where id=current_setting('qa.entry')::uuid and recorded_by=auth.uid() and shared_device and reviewed_at is null) then raise exception 'Shared device attribution failed';end if;
 begin
 insert into public.communication_guides_test(group_id,individual_id,content,expected_version) values(current_setting('qa.group')::uuid,current_setting('qa.other')::uuid,'{}',0);
 raise exception 'Caregiver published guide';exception when insufficient_privilege then null;end;
 begin
 update public.communication_entries_test set content='{}' where id=current_setting('qa.entry')::uuid;
 raise exception 'Recorded answer was editable';exception when insufficient_privilege then null;end;
 update public.communication_entries_test set reviewed_at=now() where id=current_setting('qa.entry')::uuid;
 if found then raise exception 'Caregiver marked reviewed';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.other'),true);
do $$ begin
 if exists(select 1 from public.communication_guides_test where id=current_setting('qa.guide')::uuid) or exists(select 1 from public.communication_entries_test where id=current_setting('qa.entry')::uuid) then raise exception 'Cross-individual read leaked';end if;
 begin
 insert into public.communication_entries_test(group_id,individual_id,kind,content) values(current_setting('qa.group')::uuid,current_setting('qa.person')::uuid,'individual','{}');
 raise exception 'Cross-individual write accepted';exception when insufficient_privilege then null;end;
 begin
 insert into public.communication_entries_test(group_id,individual_id,kind,content) values(current_setting('qa.group')::uuid,auth.uid(),'observation','{}');
 raise exception 'Individual forged caregiver observation';exception when insufficient_privilege then null;end;
 insert into public.communication_entries_test(group_id,individual_id,kind,content) values(current_setting('qa.group')::uuid,auth.uid(),'individual','{"answers":{"express":{"question":"QA","words":"Own answer"}}}');
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.outsider'),true);
do $$ begin
 if exists(select 1 from public.communication_guides_test where group_id=current_setting('qa.group')::uuid) or exists(select 1 from public.communication_entries_test where group_id=current_setting('qa.group')::uuid) then raise exception 'Cross-group read leaked';end if;
 begin
 insert into public.communication_entries_test(group_id,individual_id,kind,content) values(current_setting('qa.group')::uuid,current_setting('qa.person')::uuid,'individual','{}');
 raise exception 'Cross-group write accepted';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.admin'),true);
do $$ begin
 update public.communication_entries_test set reviewed_at=now() where id=current_setting('qa.entry')::uuid;
 if not exists(select 1 from public.communication_entries_test where id=current_setting('qa.entry')::uuid and reviewed_by=auth.uid() and content#>>'{answers,express,words}'='Fictional answer') then raise exception 'Review or original words failed';end if;
end $$;
rollback;
select 'PASS: guide publication/version conflicts, shared device attribution, immutable words, own-account save, admin review, cross-person and cross-group read/write denial; all QA writes rolled back' as result;
