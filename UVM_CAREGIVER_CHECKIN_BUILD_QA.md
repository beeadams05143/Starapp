# STAR UVM — caregiver-specific check-ins + approved ISA question reuse

**Scope:** This work is on `staging/uvm-intern-sandbox` and the separate Supabase project `rjozzwmkvlndanoaghtc` ONLY. Do not apply these migrations or commits to `main` without a separate rollout, review, and privacy/security assessment.

## Admin experience
- The existing dashboard keeps its layout and exposes **Edit caregiver check-in** only after a group admin check.
- `/caregiver-checkin-setup/` is the consolidated editor. Previous wizard and customization routes redirect there.
- Admin chooses the registered individual **and** caregiver using actual group membership and profile records (profile role `individual` or `caregiver`). IDs are stored, not free-typed names.
- Group defaults stay in `caregiver_checkin_configs`; individual/caregiver combinations live in `star_caregiver_checkin_assignments`.
- ISA cards are filtered by group, individual, and outcome assigned-user IDs. Legacy blank-individual cards can only be associated with the sole registered individual in a group.
- Admin chooses **Ask ISA separately** (default) or explicitly approves a compatible existing check-in source field; selected links persist in `star_isa_measure_links`.

## Caregiver experience
- Signed-in caregiver retrieves their own active assignments; their selected categories and items override group defaults.
- If the caregiver has assignments for multiple individuals, they can select the correct individual. Changing people requires confirmation and starts a blank check-in.
- The ISA step only asks *unlinked* assigned measurement questions; linked values are read once from their approved check-in fields at submission. Hidden, missing and skipped values are never interpreted as zero.
- A submitted check-in contains the assignment/individual/caregiver user IDs and any ISA answer includes outcome and measurement IDs; server stamps `checkin_id` on structured ISA answers.

## Verification completed
- UVM database migration applied with RLS on both new tables and admin-only writes.
- Existing group/admin/caregiver/individual records used; **no fictional new people or assignments were added**.
- Database transaction with rollback: authenticated admin assignment + valid link + check-in insert; verified server check-in ID stamping.
- Database transaction with rollback: temporarily downgraded caregiver to member; confirmed new assignment insert is rejected.
- JS parsed for caregiver editor, guided check-in and ISA question engine; report unit check deduplicates the same recorded ISA measurement per check-in and does not count unanswered values.
- Existing test records were preserved (see current database before making a rollout decision).

## Browser smoke test (still required)
1. Sign in as an actual UVM group admin; open **Edit caregiver check-in** beside Quick Actions.
2. Choose a registered individual and a registered caregiver, select one or two categories, save.
3. Choose an actual assigned ISA measurement; approve an existing check-in field **only** if unit/response options genuinely match, and save. Otherwise retain **Ask separately**.
4. Sign in as that caregiver; verify only their assigned sections appear, and that reused ISA measures are not duplicated in ISA Activities.
5. Skip a question; submit a fictional test shift; verify Reports includes the exact dated observation and never translates missing into zero.
6. Repeat as a non-admin to verify no edit access, and with a second caregiver to verify configurations do not leak.

**Deployment note:** Commits were pushed to the GitHub staging branch. Netlify deploy completion and browser behavior must be checked in the Netlify test-site dashboard; no Netlify API/browser access was available in this session.
