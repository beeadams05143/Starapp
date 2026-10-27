# STAR production privacy hardening — 2026-10-27

The existing `public.caregiver_checkins_easy_view` was identified by the Supabase Security Advisor as a definer view, and an unauthenticated (anon) role had SELECT privilege.

The following statements were **applied to the production database** on 2026-10-27. They do **not** modify any caregiver records.

```sql
begin;
alter view public.caregiver_checkins_easy_view set (security_invoker = true);
revoke all privileges on public.caregiver_checkins_easy_view from public, anon;
grant select on public.caregiver_checkins_easy_view to authenticated;
commit;
```

Verification from the connected Supabase project:
- `reloptions` contains `security_invoker=true`.
- `has_table_privilege('anon', view_oid, 'SELECT') = false`.
- `has_table_privilege('authenticated', view_oid, 'SELECT') = true`.
- Security Advisor no longer listed this view.

This **does not certify the entire database is secure**. Before any production user or intern access changes, verify full RLS policy behavior with separately authenticated test users, including group isolation and record authorship. Do not grant interns Supabase production project access or Netlify deploy/admin rights.

Rollback of the view option or privilege revocations would lower privacy protections; do not revert to the insecure configuration as a troubleshooting shortcut.
