# STAR Saved Drafts — implementation and security plan

Status: design only; no database migration has been applied. This document is intentionally separate from the live submission/recovery workflow.

## Confirmed Supabase schema reference (provided October 20, 2026)

**Do not ask the user to rerun the same schema-identification query.** This was verified directly from a Supabase information_schema export.

- `public.profiles`: `id uuid NOT NULL` (authenticated account ID), `group_id uuid`, `default_group_id uuid`, `display_name text`, `public_name text`, `full_name text`, `time_zone text`, plus `is_admin`, `role`, and onboarding fields.
- `public.group_members`: `user_id uuid NOT NULL`, `group_id uuid NOT NULL`, `role USER-DEFINED NOT NULL`, `joined_at timestamptz`. Use both IDs to check membership.
- `public.groups`: `id uuid NOT NULL`, `name text NOT NULL`, `created_by uuid NOT NULL`, `archived boolean NOT NULL`, plus slug/invite fields.
- `public.caregiver_checkins`: `id uuid NOT NULL`, `user_id uuid`, `group_id uuid`, `date date`, `payload jsonb NOT NULL`, `submitted_at timestamptz NOT NULL`, `caregiver_name text`, `details jsonb`, `created_at timestamp without time zone`, `submitted_at_local text`, `submitted_timezone text`, and other check-in-specific fields.
- `profiles.id` is the identity, NOT the caregiver display name. Historical screen names remain display-only.
- These are column definitions, **not proof of keys, foreign keys, policies, or membership grants**. Security migration must use `auth.uid()` plus an EXISTS check against `group_members`, and must be tested for cross-user access.
- No change to existing `caregiver_checkins` data is necessary for draft storage.

## Existing behavior verified in GitHub
- `caregiver-submission.js` maintains separate browser recovery slots scoped by authenticated user ID, group ID, and practice/real mode.
- `caregiver-submission-ui.js` already supports Save Draft, a browser recovery selector, and explicit Resume. These copies are browser-local and are not portable across devices.
- A pending/uncertain POST must be reconciled by its original record ID, not submitted again.
- Reports resolve caregiver display names from profiles. Never use screen names as access-control identifiers.

## Proposed durable draft record
Separate Supabase table `caregiver_checkin_drafts` (do not reuse `caregiver_checkins`):
- `id uuid primary key`, generated once per draft.
- `author_user_id uuid not null` referencing the authenticated user.
- `group_id uuid not null` referencing the selected group.
- `individual_id uuid null` only if consistent with the app's existing individual model.
- `checkin_date date null` (null until selected, never automatically changed at midnight).
- `draft_data jsonb not null` containing the form snapshot (not an unvalidated submitted record).
- `created_at timestamptz not null`, `updated_at timestamptz not null`.
- `version integer not null default 1` for optimistic concurrency.
- Optional `author_display_name_snapshot text` for user-facing display only.
- Drafts are never queried by provider reports and never counted as submitted check-ins.

## Authorization
- Enable and FORCE row-level security on the new draft table.
- SELECT, INSERT, UPDATE, DELETE require `auth.uid() = author_user_id` and verified membership in `group_id`.
- INSERT/UPDATE must use WITH CHECK as well as USING to prevent reassignment of owner or group.
- Server-side immutability enforcement for `author_user_id`, `group_id`, and `created_at` after creation; RLS alone does not guarantee immutability of fields the same user could change.
- Review actual group-membership table, policies, grants, and auth model before writing or applying SQL. Never use `caregiver_name` or profile display name as an authorization key.
- Restrict grants to authenticated users, and verify anonymous access is denied.
- Consider group removal: draft access should be revoked immediately when membership is removed; determine whether the draft should remain for admin recovery without granting edit rights.

## UI
- New Check-In always opens a blank form and does not auto-load an existing draft.
- My Saved Drafts displays author screen name, documented date or 'Date not selected', and last edited time.
- Continue Draft loads by immutable draft ID and preserves the documented date.
- Save Draft is an explicit action with database read-back verification and clear status.
- A draft saved Thursday and reopened Friday remains a Thursday check-in.
- Submission requires explicit date confirmation and existing verified POST workflow.
- After confirmed submission, mark/delete the matching durable draft only after verification; never lose a draft on an uncertain POST.
- Multiple tabs must not silently overwrite each other: use `version` or `updated_at` conditional writes with conflict warning.
- Browser recovery copies remain as a secondary safety net for connection loss, but must be distinguishable from server-saved drafts.
- Provide a user-visible warning when browser-only recovery is at risk of loss.

## Test gates before merge
1. Save a draft, close browser, sign back in, resume the exact draft.
2. Start Thursday, resume Friday; Thursday stays selected.
3. Two different drafts from same caregiver remain separate.
4. Another authenticated caregiver cannot read, edit, submit, or delete the draft, even via direct REST calls.
5. Another group cannot access the draft.
6. Two-tab conflicting edits warn instead of silently overwriting.
7. Network interruption and duplicate/uncertain submission do not lose the original attempt.
8. Changing display name doesn't transfer ownership; reports still show recognizable names.
9. No draft appears in caregiver reports or provider letters.
10. Existing check-in submission/date verification remains intact.

## Deployment sequence
1. Inspect current Supabase schema and RLS policies read-only.
2. Write migration on feature branch; review it, then apply to test Supabase project only.
3. Implement service + UI behind an explicit feature flag.
4. Run unit and end-to-end tests in test environment.
5. Review changes, backout plan, and privacy implications.
6. Only then merge/deploy with explicit approval.

## Other priorities
- Confirm which existing date/submission fixes have actually reached Netlify.
- Investigate missing Thursday entries without assuming root cause.
- Review existing `caregiver-provider-letter.js` narrative logic against real exported records; avoid invented quotes or clinical claims.
- Confirm dashboard-clock.js is deployed and date/greeting behave correctly.
- Implement audited correction workflow for already submitted check-ins separately.
