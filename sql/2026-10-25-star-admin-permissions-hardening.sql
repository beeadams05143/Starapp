-- STAR security follow-up for Team Updates and Emergency Medical.
-- Fixes legacy role escalation paths discovered while verifying the two feature migrations.
-- Preserves all existing group memberships, emergency data, and check-ins.
begin;

-- An earlier administrative utility ran as SECURITY DEFINER without any
-- caller authorization check; never expose it through the public Data API.
revoke all on function public.promote_user_to_admin(text, uuid)
  from public, anon, authenticated;

-- Restrict the legacy self-membership INSERT rule: group creators may establish
-- their own admin membership, but other users cannot self-appoint as admins.
-- Existing member invitations remain functional under the current application.
drop policy if exists gm_insert_self on public.group_members;
create policy gm_insert_self on public.group_members
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (
    role = 'member'::public.membership_role
    or (
      role = 'admin'::public.membership_role
      and exists (
        select 1 from public.groups g
        where g.id = group_members.group_id
          and g.created_by = (select auth.uid())
      )
    )
  )
);

-- Supabase default grants gave TRUNCATE (which bypasses RLS) and DELETE on
-- certain tables even though the new migrations only intended read/write.
revoke delete, truncate on public.star_team_updates
  from public, anon, authenticated;
revoke truncate on public.emergency_medical, public.group_members
  from public, anon, authenticated;

-- Trigger helpers must be used as triggers, not as externally callable RPCs.
revoke all on function public.star_team_updates_before_write()
  from public, anon, authenticated;
revoke all on function public.star_team_updates_audit()
  from public, anon, authenticated;
revoke all on function public.star_emergency_stamp()
  from public, anon, authenticated;

commit;
