# STAR UVM — caregiver-specific check-ins and ISA answer reuse QA

**Environment:** Netlify `star-uvm-testing.netlify.app`, GitHub branch `staging/uvm-intern-sandbox`, separate UVM Supabase project. **Never use live STAR or real individual records.**

## What has already been checked

- The three existing fictional ISA cards now retain their original IDs, measurement IDs and audit history, and each belongs to the registered test individual.
- Database access was tested with simulated JWT identities in a rolled-back transaction: an admin could create a caregiver-specific assignment and approve an ISA link; an ordinary group member could read only their assigned records and could not update them; an unrelated-group user could read neither.
- Test-only code checks passed for numeric ISA reuse (2 is 2, 0 is a real zero, blanks/hidden/invalid values are omitted), and for rejecting incompatible suggested source fields.
- Report aggregation checks passed for separate dates, real zero, blank omission, parent check-in ID, and different-individual exclusion.
- **Still required:** actual phone/desktop UI, Netlify deployment, non-admin login, and new linked submission -> report reconciliation.

## Preparation

1. Verify Netlify site is deploying the **staging/uvm-intern-sandbox** branch, not `main`.
2. Use one existing **administrator** login plus a separate **caregiver member** login (not a group admin). Current seeded test group memberships are all admins, even for caregiver-profile accounts. Invite/register a dedicated group *member* tester; do not change someone's existing account permissions or use a real individual's credentials.
3. On the test app's Dashboard, the admin should see **Edit caregiver check-in** next to Quick Actions. The member caregiver must not see it.
4. Navigate to `/caregiver-setup-wizard.html`, `/customize-checkin.html`, and `/caregiver-checkin-setup/`. All should use the single configuration editor; no competing setup wizard and no locally configured overrides.

## Test A — admin-controlled configuration

1. Admin selects the registered test individual and the intended registered caregiver from the app's dropdowns; verify IDs are looked up from the database, not typed.
2. Select a small, distinctive set of enabled questions; save. Refresh and confirm the selections persist.
3. Sign in as that caregiver; verify they get only the relevant sections and are not offered editor controls. Skip an unobserved question.
4. Try accessing the editor URL as caregiver and attempting to save. Server should reject changes, not merely hide the button.
5. If the test group has another caregiver, confirm that person gets their own assignment/default instead of another caregiver's questions.

## Test B — no false ISA matches

The three original fictional outcomes measure phone-call **steps**, community **minutes**, and leisure **participation choices**. Do **not** approve unrelated reuse merely because a field is also a number or a choice. For example, phone-call steps must **not** reuse the number of night awakenings, and a minute count must **not** reuse a duration band. These original ISA questions should remain separate unless an actually equivalent native check-in question exists.

## Test C — a deliberately equivalent ISA link

1. In the TEST environment only, use or create an approved temporary ISA measurement that **genuinely matches** an existing check-in answer, including label/meaning, unit and response options. One safe controlled example: an ISA *count of night awakenings* in units `awakenings`, to match native `night_wake_count`. Do not edit the original three cards to force a match.
2. Assign the card to the test caregiver. In the admin editor, select that caregiver and individual, review the proposed reuse, explicitly approve the correct field and save.
3. Sign in as the member caregiver. Confirm the existing check-in question appears **once** and the duplicate ISA question is absent.
4. Submit controlled check-ins on distinct unused test dates with values **2**, **0**, and a **skipped/unknown** source. Record each expected outcome and date. Do not repeatedly submit an unconfirmed duplicate for the same date.
5. On the **Reports -> ISA Outcome Progress** view, select those dates and expand the outcome's **View dated caregiver entries**. The result should show 2 and 0 on their correct dates, and **no ISA measurement recorded** for the skipped entry. Zero must not be interpreted as missing, and missing must not be interpreted as zero.
6. Verify the saved check-in record `caregiver_checkins.id` contains `payload.individual_id`, `payload.checkin_assignment_id`, and exactly one `payload.isa_entries` element for the approved ISA outcome/measurement on each answered date. The linked evidence should contain `outcome_id`, `measurement_id`, `source_field`, `isa_link_id`, `source_type`, `value`, and `assignment_id`. Confirm these refer to the *same* check-in row and current ISA card IDs.
7. Remove the approved mapping via the admin editor and save. On the caregiver's next check-in, the distinct ISA question should reappear; previous saved evidence must remain unchanged.
8. Test a hidden or unconfigured source field: the original ISA question should appear rather than silently losing its measure.

## Test D — privacy and reporting consistency

- Confirm cross-group accounts cannot access another group's setup, source check-ins or ISA link approvals.
- Confirm an assigned caregiver cannot modify the approved link or their assigned sections.
- Check that **Reports -> Caregiver Overview** and **ISA Outcome Progress** refer to the same date/individual without treating one observation as two separate ISA measurements.
- Verify the separate ISA Progress Report counts recorded evidence, preserves original values/units and dates, and **does not auto-score success**.

## How to submit findings

For each test record **pass/fail**, test date, screen, steps to reproduce, expected vs actual behavior, and a screenshot. Note whether the issue is UI, authentication/permissions, data persistence, or report accuracy. Fix confirmed defects in the UVM branch, retest, and leave live STAR unchanged.

**Acceptance:** Admin-only configuration persists; regular caregiver sees assigned check-in; approved matches show a single question; identical raw values appear once in ISA progress with the correct date, individual, caregiver and check-in; blank is missing, zero is zero; other groups remain isolated.
