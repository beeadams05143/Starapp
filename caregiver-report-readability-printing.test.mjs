import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterCaregiverCheckinsForPrint, summarizeParticipationHoursForLetter } from './caregiver-report-shared.js';

const range = {
  start: new Date('2026-08-01T12:00:00'),
  end: new Date('2026-08-28T12:00:00'),
};

const community = summarizeParticipationHoursForLetter(2040, range);
assert.equal(community.days, 28);
assert.equal(community.weeks, 4);
assert.equal(community.totalHoursText, '34 hours');
assert.equal(community.averageHoursText, '8.5 hours');

const vocational = summarizeParticipationHoursForLetter(330, range);
assert.equal(vocational.totalHoursText, '5.5 hours');
assert.equal(vocational.averageHoursText, '1.4 hours');

const partialWeek = summarizeParticipationHoursForLetter(420, {
  start: new Date('2026-08-01T12:00:00'),
  end: new Date('2026-08-03T12:00:00'),
});
assert.equal(partialWeek.days, 3);
assert.equal(partialWeek.totalHoursText, '7 hours');
assert.equal(partialWeek.averageHoursText, '16.3 hours');

const printRows = [
  { id: '1', date: '2026-08-03', caregiver_name: 'Shirley Royce' },
  { id: '2', date: '2026-08-04', caregiver_name: 'Shirley Royce' },
  { id: '3', date: '2026-08-05', caregiver_name: 'Shirley Royce' },
  { id: '4', date: '2026-08-07', caregiver_name: 'Beth Adams' },
  { id: '5', date: '2026-08-10', caregiver_name: 'Shirley Royce' },
  { id: '6', date: '2026-09-02', caregiver_name: 'Shirley Royce' },
  { id: '7', date: '2026-08-21', caregiver_name: 'Shirley Royce' },
];
assert.deepEqual(
  filterCaregiverCheckinsForPrint(printRows, { startDate: '2026-08-01', endDate: '2026-08-31' }).map((row) => row.id),
  ['1', '2', '3', '4', '5', '7']
);
assert.deepEqual(
  filterCaregiverCheckinsForPrint(printRows, { caregiver: 'Beth Adams' }).map((row) => row.id),
  ['4']
);
assert.deepEqual(
  filterCaregiverCheckinsForPrint(printRows, { weekdays: [1, 3, 5] }).map((row) => row.id),
  ['1', '3', '4', '5', '6', '7']
);
assert.deepEqual(
  filterCaregiverCheckinsForPrint(printRows, {
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    caregiver: 'Shirley Royce',
    weekdays: [1, 3, 5],
  }).map((row) => row.id),
  ['1', '3', '5', '7']
);
assert.deepEqual(
  filterCaregiverCheckinsForPrint(printRows, {
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    caregiver: 'Shirley Royce',
    weekdays: [1, 3, 5],
    specificDates: ['2026-08-03', '2026-08-21'],
  }).map((row) => row.id),
  ['1', '7']
);

const html = await readFile(new URL('./caregiver-report.html', import.meta.url), 'utf8');
assert.match(html, /summarizeParticipationForParentLetter/);
assert.match(html, /participationSentence\('Community', communitySummary\)/);
assert.match(html, /Behavior & Mental Health/);
assert.match(html, /Community Activities & Notable Experiences/);
assert.doesNotMatch(html, /Community participation averaged \$\{communityHours\.averageHoursText\} per week/);
assert.doesNotMatch(html, /Vocational participation averaged \$\{vocationalHours\.averageHoursText\} per week/);
assert.doesNotMatch(html, /Community time this period totaled \$\{totalCom\} minutes/);
assert.doesNotMatch(html, /Vocational activities were supported for \$\{totalVoc\} minutes/);
assert.match(html, /id="calendarQuickLook"[\s\S]*id="hc-grid"/);
assert.doesNotMatch(html, /id="calendarMonthShift"|Monthly Shifts|month-shift/);
assert.match(html, /function openIsolatedPrintWindow/);
assert.match(html, /function buildCalendarPrintHtml/);
assert.match(html, /function parentLetterPrintStyles/);
assert.match(html, /new jsPDF\(\{ unit: 'pt', format: 'letter', orientation: 'landscape' \}\)/);
assert.match(html, /@page\{size:Letter landscape;margin:\.35in\}/);
assert.match(html, /document\.getElementById\('parentLetterPrint'\)\?\.addEventListener\('click', \(\) => \{[\s\S]*window\.starPrintParentLetterOnly/);
assert.doesNotMatch(html, /document\.getElementById\('parentLetterPrint'\)\?\.addEventListener\('click', \(\) => window\.print\(\)\)/);
assert.match(html, /id="parentLetterStart"/);
assert.match(html, /id="parentLetterEnd"/);
assert.match(html, /id="parentLetterApply"[^>]*disabled/);
assert.match(html, /Choose a start and end date\./);
assert.doesNotMatch(html, /syncParentLetterRangeDefaults/);
assert.doesNotMatch(html, /id="calendarPrintBtn"/);
assert.match(html, /id="fullPrintBtn">🖨️ Print Caregiver Check-ins<\/button>/);
assert.match(html, /id="cgPrintOverlay"/);
assert.match(html, /Specific dates further narrow the filters/);
assert.match(html, /function checkinMatchesPrintFilters/);
assert.match(html, /filterCaregiverCheckinsForPrint/);
assert.match(html, /import \{ openCompactCaregiverCheckinPrintWindow \} from '\.\/caregiver-checkin-print\.js/);
assert.match(html, /function printCheckinRecords/);
assert.match(html, /openCompactCaregiverCheckinPrintWindow\(selected, \{ title \}\)/);
assert.doesNotMatch(html, /function renderCheckinPrintRecordHtml/);
assert.match(html, /document\.getElementById\('fullPrintBtn'\)\?\.addEventListener\('click', \(\) => \{[\s\S]*window\.starOpenCheckinPrintCenter/);

console.log('caregiver report readability and printing: PASS');
