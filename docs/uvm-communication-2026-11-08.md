# Individual communication supports — UVM testing

Scope: staging/uvm-intern-sandbox, star-uvm-testing.netlify.app, sandbox database rjozzwmkvlndanoaghtc. No production changes.

Each communication guide starts blank for the selected roster individual. No personal plan text, names, tools, signals, or preferences were copied into the implementation or seeded into the database. The nine generic prompts are options, not recorded answers.

Caregiver dashboard → How I Communicate → select an individual. My STAR → How I Communicate opens My view. The individual can use an authorized caregiver's signed-in device. Database-stamped recorder and shared-device status distinguish recorder from subject; optional assistance explains how answers were recorded.

Admin Edit team guide publishes an append-only version using an expected-version check. Other caregivers submit suggestions and observations. Mark reviewed preserves original content and does not publish guidance. Dictionary signals, possible meanings, supports, tools, settings, full details, source reference, review guidance, and first-contact instructions are individual fields. The first-contact guide and print flow contain only published guidance, not pending observations.

Saved records are durable in communication_guides_test and communication_entries_test. Both have RLS, composite roster foreign keys, and explicit column grants. Individuals access only their own records, team caregivers access their linked group's individuals, only administrators publish/review, and original entries cannot be edited. Save retries reuse the same UUID and verify ambiguous POST responses. Forms are held during unconfirmed saves.

Validation: seven new controller/model checks, plus existing person-isolation and Moments badge regressions (14 total) passed. tests/communication-rls.sql passed as authenticated fictional accounts in a rolled-back transaction: own-account and shared-device saves; recorder stamping; admin guide publication and review; stale version rejection; immutable original words; cross-person and cross-group read/write denial. No QA records remain. Security advisors reported no findings for the new objects; existing invite-table, RPC and password-protection notices remain outside this change.

Device verification remains: signed-in mobile layout, audible speech, microphone permissions/dictation, and actual print/PDF output. Controller tests are not a completed real-device walkthrough.
