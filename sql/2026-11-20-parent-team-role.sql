ALTER TABLE public.group_members DROP CONSTRAINT group_members_team_role_check, ADD CONSTRAINT group_members_team_role_check CHECK (team_role IN ('administrator','caregiver','individual','case_manager','parent'));

CREATE OR REPLACE FUNCTION star_staff.assign_team_role(g uuid, u uuid, new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_role public.group_members.role%type;
begin
 if auth.uid() is null then raise exception 'Sign in to assign roles'; end if;
 perform 1 from public.groups where id=g for update;
 if not exists(select 1 from public.group_members where group_id=g and user_id=auth.uid() and role='admin')
 then raise exception 'Only an administrator can assign roles'; end if;
 if new_role is null or new_role not in ('administrator','caregiver','individual','case_manager','parent') then raise exception 'Invalid role'; end if;
 select role into old_role from public.group_members where group_id=g and user_id=u for update;
 if not found then raise exception 'User is not a member of this group'; end if;
 if old_role='admin' and new_role<>'administrator' and not exists(
   select 1 from public.group_members gm join auth.users a on a.id=gm.user_id
   where gm.group_id=g and gm.role='admin' and gm.user_id<>u and (a.banned_until is null or a.banned_until<=now())
 ) then raise exception 'Cannot remove the last administrator'; end if;
 if new_role='administrator' then
   update public.group_members set team_role=new_role,role='admin' where group_id=g and user_id=u;
 else
   update public.group_members set team_role=new_role,role='member' where group_id=g and user_id=u;
 end if;
 if new_role='individual' then
   insert into public.star_individual_people(group_id,individual_id) values(g,u) on conflict do nothing;
 end if;
end;
$function$;
