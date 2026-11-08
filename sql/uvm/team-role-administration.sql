begin;
update public.group_members gm set team_role='individual'
from public.profiles p where p.id=gm.user_id and p.role='individual' and gm.role<>'admin';
create or replace function public.star_test_team_members(p_group_id uuid)
returns table(user_id uuid,display_name text,membership_role text,assigned_role text)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.group_members gm where gm.group_id=p_group_id and gm.user_id=auth.uid()) then raise exception 'Not authorized for this group'; end if;
 return query select gm.user_id,coalesce(nullif(p.public_name,''),nullif(p.display_name,''),nullif(p.full_name,''),nullif(u.email,''),'Team member'),gm.role,
 case when gm.role='admin' then 'administrator' else coalesce(gm.team_role,case when p.role='individual' then 'individual' else 'caregiver' end) end
 from public.group_members gm left join public.profiles p on p.id=gm.user_id left join auth.users u on u.id=gm.user_id
 where gm.group_id=p_group_id order by (gm.role='admin') desc,coalesce(p.public_name,p.full_name,''),gm.joined_at;
end $$;
create or replace function public.star_test_assign_team_role(p_group_id uuid,p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path='' as $$
declare old_role text;
begin
 if auth.uid() is null then raise exception 'Sign in to assign roles'; end if;
 perform 1 from public.groups where id=p_group_id for update;
 if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=auth.uid() and role='admin') then raise exception 'Only an administrator can assign roles'; end if;
 if p_role is null or p_role not in ('administrator','caregiver','individual','case_manager') then raise exception 'Invalid role'; end if;
 select role into old_role from public.group_members where group_id=p_group_id and user_id=p_user_id for update;
 if not found then raise exception 'User is not a member of this group'; end if;
 if old_role='admin' and p_role<>'administrator' and not exists(select 1 from public.group_members gm join auth.users u on u.id=gm.user_id where gm.group_id=p_group_id and gm.role='admin' and gm.user_id<>p_user_id and (u.banned_until is null or u.banned_until<=now())) then raise exception 'Cannot remove the last administrator'; end if;
 update public.group_members set team_role=p_role,role=case when p_role='administrator' then 'admin' else 'member' end where group_id=p_group_id and user_id=p_user_id;
 -- Profile navigation uses caregiver/individual; admin authority remains group-scoped.
 update public.profiles set role=case when p_role='individual' then 'individual' else 'caregiver' end,updated_at=now() where id=p_user_id and group_id=p_group_id;
 if p_role='individual' then
 insert into public.star_moments_test_people(group_id,individual_id) values(p_group_id,p_user_id) on conflict do nothing;
 end if;
end $$;
revoke all on function public.star_test_team_members(uuid),public.star_test_assign_team_role(uuid,uuid,text) from public,anon;
grant execute on function public.star_test_team_members(uuid),public.star_test_assign_team_role(uuid,uuid,text) to authenticated;
commit;
