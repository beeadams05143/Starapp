-- Store the optional self-report note in the existing Mood Check-Ins report row.
create or replace function public.star_save_individual_checkin(
  request_id uuid, team uuid, care_date date, kind text, answer text, words text, choices jsonb, support text
) returns void language plpgsql security invoker set search_path='' as $$
declare inserted_id uuid;
begin
  insert into public.star_individual_checkins(
    id,group_id,individual_id,checkin_date,response_type,response_value,original_words,offered_options,support_kind
  ) values(request_id,team,auth.uid()::text,care_date,kind,answer,words,choices,support)
  on conflict(id) do nothing returning id into inserted_id;
  if inserted_id is not null and kind='mood' then
    insert into public.mood_entries(group_id,user_id,date,mood,notes)
    values(team,auth.uid(),care_date,case answer
      when 'Happy' then '😊 Happy'
      when 'Okay' then '🙂 OK'
      when 'Sad' then '😢 Sad'
      when 'Upset' then '😠 Upset'
      when 'Tired' then '😴 Tired'
      when 'Unwell' then '🤒 Sick'
      else answer end,nullif(words,''));
  end if;
end;
$$;
