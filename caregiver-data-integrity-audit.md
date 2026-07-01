# Caregiver identity integrity audit — 2026-07-01

## Finding

The report query is scoped to active group `3159dde9-8cf3-4a29-af72-01da907f241b`. The unexpected preview names were not returned from another group. They came from production `caregiver_checkins` rows carrying that group ID even though their seven users have no `group_members` relationship and their profiles have `group_id = null`.

The profile hydrator also selected a nonexistent `profiles.name` column. That made profile hydration fail as a unit and allowed raw check-in fallback names such as `skr.tysonroad@gmail.com` to appear instead of the valid profile name.

`skr.tysonroad@gmail.com` is not a preview user. Check-in `8cbb0a9c-2909-4cbb-a570-d320413a09c6` belongs to user `e3785c5e-6560-4a6c-b136-31a4ebfbcb8f`; that user's profile is **Shirley Royce** and its profile group matches the active group.

No exact unexpected names were found in current source, SQL migrations, seeds, or demo tables. Git history contained only a removed friendly-name mapping from `skr.tysonroad@gmail.com` to Shirley. A standalone `Preview Metric Test` record was not found; the persisted value is `Ann Preview Metric Test`.

## Unauthorized production records — do not delete without approval

| Displayed name | User ID | Check-in IDs |
|---|---|---|
| Preview Caregiver | `900b4aee-8747-4d80-8971-d32fad33b14f` | `c1821c5d-7464-4475-88da-269d055c69b3`, `ed4eb51a-8bf7-40b7-883d-b805f8a58444` |
| Preview Caregiver | `e6bb046e-697a-4b07-8ef0-95ce5598beb6` | `4e77f536-4abb-4be7-bd54-e207908ebaaa` |
| Preview caregiver | `5b33a61f-07aa-4e47-8e4b-a025b0690c8b` | `6286395d-7131-4072-ad4c-a5e82ffcb21b`, `494fbb06-c260-41b6-9aeb-4bbe513a576f` |
| Preview Caregiver | `3f8080d8-dba6-4f42-a1a5-0596d9172110` | `99c05fcd-5e5d-418b-a1b5-f407c83ddda4`, `0426ad1d-0c11-4654-9439-0b8a1324350f`, `6e0a5267-2962-4511-b937-4b167f7c99da` |
| Preview Caregiver | `0dcbe8d3-db25-4504-8b2e-576abbb2f856` | `bdc6881a-0eba-414c-b38b-04a44891ec6b`, `d2d08709-d89a-4fa4-b3a4-a5cf945c581e`, `4ccbc3fb-44de-4551-9c58-a2d5e44c8ee3` |
| Ann Preview Metric Test | `22cc79da-07c8-4f43-880a-f662a17e6270` | `5b4d372d-a230-42eb-b533-e4394610683b`, `6dd8377c-e19a-4fd1-b3ef-4bea0f2b8f27`, `38c05419-40c4-434b-8792-06fb55caadc1` |
| Preview Caregiver | `314b10ee-7d27-48c4-b9c6-c2c6b44ec32c` | `24e2bb9d-19d3-449a-8f3b-5f6436ef3068`, `bb899022-2aa0-4efb-a11e-d909d599956e` |
| Preview Metrics Current A / Current B / Previous | `abeee181-4f5e-4190-a164-b2f31cb233ba` | `491edb99-c1be-48f3-893b-37533b046456`, `a73ab4ba-95c0-48e0-893e-8715e890e300`, `57b3962e-94b3-40a8-8b96-71cf51a5abaf` |

Their profile names contain `preview-lane02`, `preview-lane03`, or `star.preview.lane03`, strongly identifying automated preview/test identities. The rows were created June 9–10, 2026, except for backdated service dates used by the metric tests.

## Rendering path

1. `resolveActiveGroup()` selects a group from the signed-in user's memberships/profile.
2. `loadFromSupabase()` queries `caregiver_checkins` with `group_id=eq.<active group>`.
3. Profile hydration resolves each row's `user_id` to a display name.
4. The report normalizes the rows and `caregiverViewLabel()` supplies the caregiver table and parent-letter name list.
5. Previously, every row with the matching text `group_id` reached this pipeline. The new guard additionally requires either a matching `group_members` row or a matching legacy `profiles.group_id`.

## Permanent fix and cleanup recommendation

The application now validates the relational group association on report reads and fixes profile hydration. A matching database RLS `INSERT`/`UPDATE` policy should also require `auth.uid()` to be associated with `caregiver_checkins.group_id`; this must be reviewed against the production policy names before applying.

Safest cleanup sequence:

1. Export the 19 check-ins above for archival review.
2. Confirm the seven preview users are not intentionally retained QA identities.
3. Delete only the listed check-in IDs in one transaction and verify the affected-row count is exactly 19.
4. Remove the seven orphan profiles/auth users only after confirming they own no other production records.
5. Apply and test the database membership RLS policy in a non-production group before production.

No database records were changed or deleted during this audit. A normal signed-in client cannot enumerate `auth.users`; admin/service-role review is still required before deleting any auth identity.
