import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatEntryForList } from './caregiver-report-supabase.js';

const checkinHtml = await readFile(new URL('./caregiver-checkin.html', import.meta.url), 'utf8');
const reportHtml = await readFile(new URL('./caregiver-report.html', import.meta.url), 'utf8');
const reportLoader = await readFile(new URL('./caregiver-report-supabase.js', import.meta.url), 'utf8');

assert.match(checkinHtml, /let isSubmittingFinal = false;/);
assert.match(checkinHtml, /if \(isSubmittingFinal\) return;/);
assert.match(checkinHtml, /reviewSubmitBtn\.disabled = true/);
assert.match(checkinHtml, /reviewSubmitBtn\.disabled = false/);
assert.match(checkinHtml, /Supabase did not return the saved caregiver check-in/);
assert.match(checkinHtml, /caregiver_checkins\?select=id,user_id,group_id,date,submitted_at&/);
assert.match(checkinHtml, /Restored draft from/);
assert.match(checkinHtml, /let draft = createEmptyDraft\(\);/);
assert.match(checkinHtml, /resetFormValues\(\);\s*updateSavedButtons\(\);/);
assert.match(checkinHtml, /function clearEntryDateSelection\(\)[\s\S]*entryDateInput\) entryDateInput\.value = '';/);
assert.match(checkinHtml, /function requireExplicitEntryDate\(\)[\s\S]*Please select the check-in date before reviewing or submitting/);
assert.match(checkinHtml, /const entryDate = currentExplicitEntryDate\(\);[\s\S]*Please select the check-in date before submitting/);
assert.match(checkinHtml, /discardDraftBtn\?\.addEventListener\('click'/);
assert.match(checkinHtml, /function saveDraftExplicitly\(\)[\s\S]*captureCurrentFormAsDraft\(\);[\s\S]*persistDraft\(\);/);
assert.match(checkinHtml, /step\.querySelector\('\[data-save\]'\)\?\.addEventListener\('click', saveDraftExplicitly\)/);
assert.match(checkinHtml, /const data = serialize\(s\);/);
assert.ok(
  checkinHtml.indexOf('resetFormValues();\n    updateSavedButtons();') < checkinHtml.indexOf("resumeDraftBtn?.addEventListener('click'"),
  'new check-in initialization must reset blank before offering explicit draft resume'
);
assert.ok(
  checkinHtml.indexOf("resumeDraftBtn?.addEventListener('click'") < checkinHtml.indexOf('applyDraftToForm();'),
  'draft hydration must only happen from the explicit Resume action'
);
assert.doesNotMatch(checkinHtml, /entryDateInput\.value = todayISO\(\)/);
assert.doesNotMatch(checkinHtml, /: todayISO\(\)/);
assert.doesNotMatch(checkinHtml, /todayISO/);
assert.doesNotMatch(checkinHtml, /autosaves/i);
assert.doesNotMatch(checkinHtml, /Save &amp; Next/);
assert.doesNotMatch(checkinHtml, /setTimeout\(\(\) => save/);
assert.doesNotMatch(checkinHtml, /SUBMISSION_COMPLETE_KEY/);
assert.doesNotMatch(checkinHtml, /MOVEMENT_LAST_KEY/);
assert.doesNotMatch(checkinHtml, /localStorage\.setItem\(SUBMISSION/);
assert.doesNotMatch(checkinHtml, /localStorage\.setItem\(MOVEMENT/);
assert.ok(
  checkinHtml.indexOf('persistDraft();') > checkinHtml.indexOf('function saveDraftExplicitly()'),
  'draft persistence must be reached through explicit Save Draft'
);
assert.ok(
  checkinHtml.indexOf('const markEntryDateSelected = () =>') < checkinHtml.indexOf("entryDateInput?.addEventListener('change', markEntryDateSelected);"),
  'date changes may update only current-session validation state'
);
assert.doesNotMatch(
  checkinHtml.slice(
    checkinHtml.indexOf('const markEntryDateSelected = () =>'),
    checkinHtml.indexOf("entryDateInput?.addEventListener('change', markEntryDateSelected);")
  ),
  /persistDraft|localStorage|setItem/
);

assert.match(reportHtml, /STAR_ENABLE_REPORT_SMOKE_INSERT/);
assert.match(reportHtml, /localhost', '127\.0\.0\.1/);
assert.ok(
  reportHtml.indexOf('if (!smokeInsertEnabled)') < reportHtml.indexOf("Run.addEventListener('click', smoke);"),
  'report smoke insert must be gated before the click handler is attached'
);

assert.match(reportLoader, /group_id=eq\.\$\{encodeURIComponent\(activeGroupId\)\}/);
assert.match(reportLoader, /const key = row\.id \|\| row\.submitted_at \|\| row\.timestamp \|\| row\.created_at;/);
assert.doesNotMatch(reportLoader, /memberIds\.has\(userId\) \|\| profileGroupId === groupId/);

const sameDateRows = [
  { id: 'beth-1', user_id: 'beth', caregiver_name: 'Beth', group_id: 'g1', date: '2026-10-07' },
  { id: 'josh-1', user_id: 'josh', caregiver_name: 'Josh', group_id: 'g1', date: '2026-10-07' },
  { id: 'shirley-1', user_id: 'shirley', caregiver_name: 'Shirley', group_id: 'g1', date: '2026-10-07' },
  { id: 'beth-2', user_id: 'beth', caregiver_name: 'Beth', group_id: 'g1', date: '2026-10-07' },
];

assert.deepEqual(sameDateRows.map((row) => row.id), ['beth-1', 'josh-1', 'shirley-1', 'beth-2']);
assert.deepEqual(
  sameDateRows.map((row) => formatEntryForList(row).dateTime),
  ['Oct 07, 2026', 'Oct 07, 2026', 'Oct 07, 2026', 'Oct 07, 2026']
);

console.log('caregiver reliability safeguards: PASS');
