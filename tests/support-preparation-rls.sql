-- Test-project integration checks. All writes are rolled back.
begin;
select set_config('qa.group','c40d0ac1-0122-46f6-b358-fac283287bb5',true),set_config('qa.person','58d3ac51-3dc7-4ead-b22f-8cb5829a3bac',true),set_config('qa.other','490dbc4d-7fa6-40f0-a2c1-c0fa0d33a868',true),set_config('qa.caregiver','ff639dab-4c75-4573-ad15-cfd3a8538101',true),set_config('qa.outsider','cac4a01d-5595-49ff-b960-e502d7e044aa',true),set_config('qa.topic',gen_random_uuid()::text,true),set_config('qa.entry',gen_random_uuid()::text,true),set_config('qa.source',gen_random_uuid()::text,true),set_config('qa.foreignsource',gen_random_uuid()::text,true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.caregiver'),true);
do $$ begin
 insert into public.communication_entries_test(id,group_id,individual_id,kind,content) values(current_setting('qa.source')::uuid,current_setting('qa.group')::uuid,current_setting('qa.person')::uuid,'individual','{"answers":{"express":{"words":"Fictional source words"}}}');
 insert into public.communication_entries_test(id,group_id,individual_id,kind,content) values(current_setting('qa.foreignsource')::uuid,current_setting('qa.group')::uuid,current_setting('qa.other')::uuid,'individual','{"answers":{"express":{"words":"Another individual"}}}');
 insert into public.support_preparation_topics_test(id,group_id,individual_id,label) values(current_setting('qa.topic')::uuid,current_setting('qa.group')::uuid,current_setting('qa.person')::uuid,'Fictional QA concern');
 insert into public.support_preparation_entries_test(id,group_id,individual_id,field_id,topic_id,perspective,content,source_refs) values(current_setting('qa.entry')::uuid,current_setting('qa.group')::uuid,current_setting('qa.person')::uuid,'s4q1',current_setting('qa.topic')::uuid,'individual','{"words":"Fictional contribution","choices":[]}',jsonb_build_array(jsonb_build_object('kind','communication','id',current_setting('qa.source'),'content','Forged snapshot')));
 if not exists(select 1 from public.support_preparation_entries_test where id=current_setting('qa.entry')::uuid and recorded_by=auth.uid() and shared_device and source_snapshots#>>'{0,content,answers,express,words}'='Fictional source words') then raise exception 'Attribution or server source snapshot failed';end if;
 begin
 insert into public.support_preparation_entries_test(group_id,individual_id,field_id,perspective,content,source_refs) values(current_setting('qa.group')::uuid,current_setting('qa.person')::uuid,'s3q1','team','{}',jsonb_build_array(jsonb_build_object('kind','communication','id',current_setting('qa.foreignsource'))));
 raise exception 'Foreign source accepted';exception when raise_exception then if sqlerrm not like 'Linked source is missing%' then raise;end if;end;
 begin
 insert into public.support_preparation_entries_test(group_id,individual_id,field_id,topic_id,perspective,content) values(current_setting('qa.group')::uuid,current_setting('qa.other')::uuid,'s4q1',current_setting('qa.topic')::uuid,'team','{}');
 raise exception 'Cross-person concern accepted';exception when foreign_key_violation then null;end;
 begin
 update public.support_preparation_entries_test set content='{}' where id=current_setting('qa.entry')::uuid;
 raise exception 'Original words editable';exception when insufficient_privilege then null;end;
 begin
 insert into public.support_preparation_entries_test(group_id,individual_id,field_id,perspective,content,source_snapshots) values(current_setting('qa.group')::uuid,current_setting('qa.person')::uuid,'s3q1','team','{}','[]');
 raise exception 'Client could stamp source snapshot';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.other'),true);
do $$ begin
 if exists(select 1 from public.support_preparation_entries_test where id=current_setting('qa.entry')::uuid) or exists(select 1 from public.support_preparation_topics_test where id=current_setting('qa.topic')::uuid) then raise exception 'Cross-person read leaked';end if;
 begin
 insert into public.support_preparation_entries_test(group_id,individual_id,field_id,perspective,content) values(current_setting('qa.group')::uuid,current_setting('qa.person')::uuid,'s3q1','individual','{"words":"Wrong person"}');
 raise exception 'Cross-person write accepted';exception when insufficient_privilege then null;end;
 begin
 insert into public.support_preparation_entries_test(group_id,individual_id,field_id,perspective,content) values(current_setting('qa.group')::uuid,auth.uid(),'s3q1','team','{"words":"Forged caregiver voice"}');
 raise exception 'Individual could impersonate team';exception when insufficient_privilege then null;end;
 insert into public.support_preparation_entries_test(group_id,individual_id,field_id,perspective,content) values(current_setting('qa.group')::uuid,auth.uid(),'s3q1','individual','{"words":"My own answer"}');
 if not exists(select 1 from public.support_preparation_entries_test where recorded_by=auth.uid() and not shared_device and content->>'words'='My own answer') then raise exception 'Own-account save failed';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.outsider'),true);
do $$ begin
 if exists(select 1 from public.support_preparation_entries_test where group_id=current_setting('qa.group')::uuid) then raise exception 'Cross-group read leaked';end if;
 begin
 insert into public.support_preparation_entries_test(group_id,individual_id,field_id,perspective,content) values(current_setting('qa.group')::uuid,current_setting('qa.person')::uuid,'s3q1','team','{}');
 raise exception 'Cross-group write accepted';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: shared-device and own-account saves; source snapshots from actual same-person records; cross-person source and concern denial; immutable words; recorder stamping; forged snapshot denial; cross-person and cross-group read/write isolation. QA writes rolled back.' as result;
