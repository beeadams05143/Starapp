import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatEntryForList } from './caregiver-report-supabase.js';
import {
  filterCaregiverCheckinsForPrint,
  normalizeCaregiverCheckinForCalendar,
} from './caregiver-report-shared.js';

const checkinHtml = await readFile(new URL('./caregiver-checkin.html', import.meta.url), 'utf8');
const reportHtml = await readFile(new URL('./caregiver-report.html', import.meta.url), 'utf8');
const reportLoader = await readFile(new URL('./caregiver-report-supabase.js', import.meta.url), 'utf8');

// Submission behavior is exercised in caregiver-submission.test.mjs and the browser suite.
assert.match(checkinHtml, /formEl.addEventListener\('submit', submitFinal\)/);
assert.match(checkinHtml, /payload.entry_date = entryDate/);
assert.match(checkinHtml, /date: entryDate/);
assert.match(checkinHtml, /submissionUI.context.groupId/);
assert.doesNotMatch(checkinHtml, /todayISO/);
assert.doesNotMatch(checkinHtml, /entryDateInput.value = new Date/);
assert.doesNotMatch(checkinHtml, /window.location.href = 'caregiver-report.html'/);
assert.match(checkinHtml, /id="checkinFields" disabled/);
assert.match(checkinHtml, /id="checkinDateConfirmed" autocomplete="off" required disabled/);
assert.match(checkinHtml, /id="submitAll" type="submit" disabled/);
assert.doesNotMatch(checkinHtml, /id="reviewOverlay"/);

assert.match(reportHtml, /STAR_ENABLE_REPORT_SMOKE_INSERT/);
assert.match(reportHtml, /localhost', '127\.0\.0\.1/);
assert.ok(
  reportHtml.indexOf('if (!smokeInsertEnabled)') < reportHtml.indexOf("Run.addEventListener('click', smoke);"),
  'report smoke insert must be gated before the click handler is attached'
);

assert.match(reportLoader, /group_id=eq\.\$\{encodeURIComponent\(activeGroupId\)\}/);
assert.match(reportLoader, /const key = row\.id \|\| row\.submitted_at \|\| row\.timestamp \|\| row\.created_at;/);
assert.doesNotMatch(reportLoader, /memberIds\.has\(userId\) \|\| profileGroupId === groupId/);
assert.doesNotMatch(reportLoader, /const getCheckinDateValue = \(e\) => \{[\s\S]*e\.submitted_at[\s\S]*\};/);
assert.match(reportLoader, /order=date\.desc,submitted_at\.desc\.nullslast,created_at\.desc\.nullslast/);
assert.match(reportLoader, /offset=\$\{offset\}/);
assert.match(reportHtml, /calendarEmptyLabel\(checkinLoadState, key, todayKey, rec.has_checkin\)/);
assert.match(reportHtml, /<th>Check-In Date<\/th>/);
assert.doesNotMatch(reportHtml, /<th>Timestamp<\/th>\s*<th>Caregiver<\/th>/);
assert.match(reportHtml, /const localDayKey = \(date = new Date\(\)\) =>/);
const calendarModuleStart = reportHtml.indexOf("import { CALENDAR_EMOJI, CALENDAR_QUICK_LOOK_ITEMS, normalizeCaregiverCheckinForCalendar }");
assert.ok(calendarModuleStart > 0, 'calendar module import should be present');
assert.doesNotMatch(
  reportHtml.slice(calendarModuleStart),
  /formatDateInputValue\(new Date\(\)\)/
);

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

const submittedNextDay = {
  id: 'tue-submitted-wed',
  user_id: 'beth',
  caregiver_name: 'Beth',
  group_id: 'g1',
  date: '2026-10-06',
  submitted_at: '2026-10-07T13:19:13Z',
  created_at: '2026-10-07T13:19:13Z',
  payload: { entry_date: '2026-10-06', hours_sleep: '10+ hrs' },
};
assert.equal(formatEntryForList(submittedNextDay).dateTime, 'Oct 06, 2026');
assert.equal(normalizeCaregiverCheckinForCalendar(submittedNextDay).dateKey, '2026-10-06');
assert.deepEqual(
  filterCaregiverCheckinsForPrint([submittedNextDay], { startDate: '2026-10-06', endDate: '2026-10-06' }).map((row) => row.id),
  ['tue-submitted-wed']
);
assert.deepEqual(
  filterCaregiverCheckinsForPrint([submittedNextDay], { startDate: '2026-10-07', endDate: '2026-10-07' }).map((row) => row.id),
  []
);

console.log('caregiver reliability safeguards: PASS');
