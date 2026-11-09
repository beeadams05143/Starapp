# Support reporting: testing and live promotion

The check-in stores `payload.shift_supports` as an array of `{support, location, note, minutes}`. `minutes` is a whole number 0–1440, or null when unrecorded. Draft capture/restoration retains this field. Existing entries without minutes remain valid and are counted as unknown time, never zero hours.

`support-report.js` reads saved caregiver records. It has no sandbox URL, fixture flag, default person, or synthetic-account dependency. It requires explicit group/person scope, uses the recorded civil date, excludes duplicate record IDs, and totals only valid recorded minutes. Support-entry counts are separate from hours; overlapping service entries must not be treated as billing totals.

Tested against the current live branch code at `6a9e662e06403c415fbbe211624f1aa639250864`: the actual `CaregiverSubmission` implementation and report `normalizeSupabaseEntry` preserve an ordinary user's support/location/minutes payload. A simulated round trip reported 45 minutes and one unknown duration. UVM authenticated INSERT/SELECT verification also preserved 135 minutes, then rolled back the verification record. Tests cover drafts, zero/unknown time, invalid values, date/person/group filtering, selected-person chart rendering, ISA data, and satisfaction data.

Only UVM Testing is published in this change. The live database could not be inspected with the connector's current permissions; its actual constraints and a signed-in browser round trip remain release checks. This is code-compatibility evidence, not a claim of a verified live deployment.

Promote the check-in time control and import, support-report.js/css, the report chart markup/import, and the person-centered chart controller changes together. Preserve production authentication, data sources and existing permissions. The support chart itself needs only the existing caregiver JSON payload; do not run any fictional SQL against production. ISA/Individual Voice tables must be available or have an appropriate production source configured; a source error is shown explicitly and does not prevent support charts from rendering.

The three `fictional-*-chart-data`/`fictional-test-team-*` seed scripts are isolated UVM fixtures tied to disabled synthetic accounts, not app logic. Normal saves never create sample entries.
