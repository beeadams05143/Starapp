import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizeParticipationHoursForLetter } from './caregiver-report-shared.js';

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

const html = await readFile(new URL('./caregiver-report.html', import.meta.url), 'utf8');
assert.match(html, /Community participation averaged \$\{communityHours\.averageHoursText\} per week/);
assert.match(html, /Vocational participation averaged \$\{vocationalHours\.averageHoursText\} per week/);
assert.doesNotMatch(html, /Community time this period totaled \$\{totalCom\} minutes/);
assert.doesNotMatch(html, /Vocational activities were supported for \$\{totalVoc\} minutes/);
assert.match(html, /id="calendarQuickLook"[\s\S]*id="hc-grid"/);
assert.doesNotMatch(html, /id="calendarMonthShift"|Monthly Shifts|month-shift/);
assert.match(html, /function openIsolatedPrintWindow/);
assert.match(html, /function buildCalendarPrintHtml/);
assert.match(html, /function parentLetterPrintStyles/);
assert.match(html, /new jsPDF\(\{ unit: 'pt', format: 'letter', orientation: 'landscape' \}\)/);
assert.match(html, /document\.getElementById\('parentLetterPrint'\)\?\.addEventListener\('click', \(\) => \{[\s\S]*window\.starPrintParentLetterOnly/);
assert.doesNotMatch(html, /document\.getElementById\('parentLetterPrint'\)\?\.addEventListener\('click', \(\) => window\.print\(\)\)/);

console.log('caregiver report readability and printing: PASS');
