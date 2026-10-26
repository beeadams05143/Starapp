# STAR sandbox — UVM interns (staging only)

Status: **Prepared, not yet provisioned or deployed.** The staging branch must NOT use the production Supabase project or production auth accounts.

## Isolation requirements
- Staging source: `staging/uvm-intern-sandbox` (not production `main`).
- Netlify: create a NEW staging site or branch preview with a clearly distinct hostname and deploy only this branch. Do not repoint the production site.
- Supabase: use an independently owned, EMPTY staging project (new project quoted at $10/month in owner's existing Pro organization on 2026-10-26). Do not clone personal or caregiver production data.
- `supabaseClient.js` intentionally points to an INVALID hostname with an INVALID key until the isolated project is approved and provisioned. Its auth localStorage scope is `starapp-intern-sandbox`.
- No `service_role` key in GitHub, browser code, Netlify static files or intern messages. Only the staging project's publishable (public) key is permitted in the browser.
- Before deployment, search staging code for ALL direct production project URLs, production secrets and data-bearing endpoints, and replace or disable every path. Confirm no requests hit production in a browser network test.
- Configure staging Auth site URL, allowed redirect URLs, sign-up email confirmation, password reset, and email sender. Users create their own private passwords.
- Invite each intern with their own email; assign least-privilege group roles. Do not share a login/password or grant access to the production Supabase project.
- Enable RLS on ALL exposed test tables; verify cross-account/cross-group denials. Include an admin account, distinct caregivers, and a case-manager/read-only role only after role scoping is implemented.
- Keep GitHub intern work in staging PRs; review before any move to main.

## Fictional seed plan (no real names or records)
- Group A: Cedar Grove Test Team. Individual: Jamie Rivers (fictional).
- Group B: Pine Meadow Test Team. Individual: Taylor Brook (fictional).
- One administrator and one caregiver for each group; extra read-only tester when access rules support it.
- At least three active ISA Outcome Cards with distinct measurement kinds: narrative observation, participation choices, numeric count or duration. At least one card assigned only to a specific caregiver.
- Additional fictional health scenarios: normal sleep, poor sleep, PRN with explicit reason/time, incident narrative, gold-star observation.

## Pass/fail acceptance
1. Same email may sign up for TEST only with a new password (independent account from production).
2. Every page visibly says STAR TEST — fictional data only.
3. Test sign-in cannot access production data; production sign-in cannot access test data.
4. RLS denies cross-group and unauthorized edit attempts at database/API level, not just hidden buttons.
5. Assigned ISA questions render based on active outcome cards. Unassigned questions remain accessible only through explicitly authorized alternate observation flow.
6. Save draft, restore on another device, edit, submit, and verify date preservation and distinct records.
7. Blank / unanswered remains missing, not false, 0, or declined. Counts, durations, and qualitative answers produce accurate reports.
8. Existing health modules/PRN details, safety incidents, and gold-star notes remain intact.
9. Exports and provider/ISA reports show exactly the recorded fictional evidence, with correct attribution and units.
10. Reset/clear test data without affecting other test groups or production.

## Unfinished dependencies
- Owner approval of $10/month additional Supabase project cost AND choice of organization.
- New project provisioning, minimal schema migrations, RLS/security and Auth verification.
- Separate Netlify staging deployment or Netlify branch-preview configuration.
- Secure email signup / password-setting per test user (no hardcoded credentials).
- Manual signed-in mobile and desktop testing, and intern acceptance test run.
