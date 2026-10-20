# Caregiver submission reliability — local validation

Release 2026.10.20A. Validation was performed locally with no real Supabase writes. Git push and Netlify deployment status are reported separately.

## Files for this change

- `caregiver-checkin.html`: single inline date-confirmed submit action, locked initialization, question serialization unchanged, durable completion message, recovery controls visible.
- `caregiver-submission-ui.js`: explicit date confirmation, scoped recovery, pending-attempt checks, identity/group lock, status messages, navigation protection, practice completion.
- `caregiver-submission.js`: validated date-only keys, duplicate preflight, single POST per attempt, response and read-back verification, read-only reconciliation, verified recovery storage.
- `restClient.js`: optional request cancellation and expected-caregiver enforcement after session refresh; HTTP status retained on errors.
- `caregiver-submission.test.mjs`, `caregiver-submission-auth.test.mjs`, `caregiver-submission.browser.mjs`: behavioral regression coverage.
- `caregiver-reliability.test.mjs`: updated assertions for the new inline submission workflow; report/calendar assertions retained.

The earlier calendar fixes remain in the working tree and are covered by the existing test suites.

## Validation

- All 13 `*.test.mjs` suites pass.
- All 20 browser scenarios pass in headless Chrome, including desktop, iPad-sized touch emulation, and mobile touch emulation.
- Browser tests intercept every non-local request. All Supabase responses and writes are fixtures; no production data is used.
- Check-in/report HTML inline scripts and changed JavaScript parse successfully: 22 scripts/modules; 49 local references resolve. Referenced HTML scripts/styles exist. `git diff --check` passes.
- This repository is a static site with no package manifest or configured production compilation command. Static asset/syntax validation was used; no build or deployment was invented.

Run unit suites with `node <filename>.test.mjs`.

Run browser scenarios with Playwright installed outside the application:

```sh
STAR_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node caregiver-submission.browser.mjs
```

The runner starts a localhost server, uses installed Google Chrome, and mocks external traffic. It needs permission to bind localhost and launch a browser.

## Save protocol and existing record IDs

Existing project code reads check-ins by `id`; recorded examples in the repository use UUID IDs. The new code supplies a client-generated UUID in that existing column and persists it with the exact submission snapshot before sending a POST. It does not use an upsert, update an existing check-in, or introduce a database column.

Success requires both the insert response and a subsequent read-back to match ID, caregiver ID, group ID, database date and `payload.entry_date`. Verification failures retain the attempt and answers. Once a POST might have been sent, retries perform only reads of that attempt's ID. Even an empty read result does not automatically authorize another insert, since permissions or a delayed commit can make absence ambiguous.

Live UUID-column insert compatibility, primary-key constraints, defaults, triggers and RLS policies were not available for verification. No SQL schema definitions were inferred as confirmed. These should be checked before a controlled, separately approved live integration test. Safe reconciliation does not depend on repeating POST or adding a uniqueness migration.

## Remaining limitations

- Recovery is local to the current browser/origin. Storage denial, browser-data deletion, private-session closure or device loss can defeat it. The UI warns, offers a JSON download, and blocks real submission when a durable pending-attempt copy cannot be verified. Downloaded JSON is a readable backup; there is no automatic file-import workflow.
- Existing unscoped `cg-checkin-draft-v1` data is neither deleted nor automatically restored. Its caregiver/group ownership cannot safely be inferred. New recovery slots are scoped and separate from practice slots.
- An unresolved attempt may require read-only support investigation using its attempt ID. STAR deliberately does not offer blind resubmission or reconstruct the missing October 1/8 records.
- Same-browser submissions are serialized with Web Locks when available. Across different devices, simultaneous same-caregiver/day submissions can race between duplicate preflight and insertion; there is no new server-side lock or constraint. An already visible same-day record always requires an explicit additional-entry decision.
- Browser tests emulate desktop/tablet/mobile in Chrome. Physical iPad/iPhone Safari and production Supabase round trips have not been tested.
- No existing database records or schema were modified by this work.

## Dashboard and provider letter release

- `dashboard-clock.js` reads the browser's current local clock every second and on focus, pageshow, and visibility changes. The dashboard date and greeting are independent of check-in state. DST and six time zones are covered by `dashboard-clock.test.mjs`.
- `caregiver-answer-quality.js` preserves blank engagement, appetite, and PRN values. New payloads include `answer_quality_version: 1`; existing records are never rewritten. The three viewport submission tests verify null values in the actual outgoing mocked payload.
- `caregiver-provider-letter.js` builds a group/individual-scoped daily timeline using selected dates. It preserves conflicting answers, excludes conflicting date keys, deduplicates record IDs, counts record/date coverage, examines consecutive-day pairs, reports interval spacing and symptom clusters, and compares equal-length windows only with at least seven answered dates per window. These are conservative software heuristics, not clinical thresholds.
- Original note fields and exact contiguous quote offsets are retained separately from synthesized display notes. Conservative dictionary rules handle common themes, exclude negated/uncertain/historical wording, and label repeated wording. Rules may miss nuance or context; caregiver review is required. Quotations can be omitted before printing. No notes are sent to an AI service.
- Possible repeat PRN administration entries are flagged rather than silently combined. Different caregivers may describe the same event; unique administrations cannot always be determined.
- Historical zero engagement and negative appetite/PRN values are treated as ambiguous, not reconstructed. Unassigned individual records are isolated from identified individuals and carry an explicit same-person review warning.
- The existing report feature now displays Provider Letter, with the seven narrative sections. Browser tests generate the actual report, check dated quotations and group exclusion, exercise quotation omission and the print window, and reject generation/printing after an active-group switch.
- `ui-shell.js` and `version.txt` identify build `2026.10.20A`.

Static production validation: `node scripts/validate-caregiver-release.mjs`.
Unit/regression validation: run each `*.test.mjs` with Node.
No compiler or package build is configured in this static-site repository.
