import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildCompactCaregiverCheckinPrint,
  renderCompactCaregiverCheckinPrintDocument,
} from './caregiver-checkin-print.js';

const septTwoRecord = {
  id: 'sept-2',
  date: '2026-09-02',
  submitted_at: '2026-09-02T20:15:00-04:00',
  caregiver_name: 'Shirley',
  payload: {
    caregiver_name: 'Shirley',
    entry_date: '2026-09-02',
    had_bm: 'yes',
    hours_sleep: '10+ hrs',
    appears_tired: 'no',
    appetite_change_flag: 'no',
    med_change_flag: 'no',
    temp_present: 'no',
    prn_used_today: 'no',
    mood_energy: 'typical',
    mood_speech: 'rapid_pressured',
    mood_attention: 'some_difficulty',
    mood_engagement: '1',
    mood_pacing: 'none',
    mood_irritability: 'mild',
    vocational_participation: 'yes',
    vocational_time: '30-60 min',
    vocational_prompting: '2',
    public_activity_type: 'Went to store',
    public_activity_time: '15-30 min',
    public_activity_prompting: '1',
    interaction_type: 'Greeting',
    interaction_prompting: '0',
    adl_entries: JSON.stringify([
      { category: 'Hygiene / Toileting', activities: ['Brushed teeth', 'Washed face', 'Toilet routine'] },
      { category: 'Cleaning / Household', activities: ['Brought dishes to sink', 'Brought trash out', 'Sorted recycling'] },
    ]),
    caregiver_notes: 'A longer note stays full width so it remains readable in the print layout.',
  },
};

const model = buildCompactCaregiverCheckinPrint(septTwoRecord);
assert.ok(model.sections.some((section) => section.title === 'PRN Medication'));
assert.deepEqual(
  model.sections.find((section) => section.title === 'PRN Medication').rows.map((row) => row.label),
  ['PRN used']
);

const html = renderCompactCaregiverCheckinPrintDocument([septTwoRecord], { title: 'Caregiver Check-In' });
assert.match(html, /field-grid/);
assert.match(html, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(html, /chip-list/);
assert.match(html, /✓ Brushed teeth/);
assert.match(html, /✓ Brought dishes to sink/);
assert.match(html, /Speech[\s\S]*Rapid \/ pressured/);
assert.match(html, /Attention[\s\S]*Some difficulty focusing/);
assert.doesNotMatch(html, /Energy[\s\S]*Typical/);

const detailJs = await readFile(new URL('./caregiver-checkin-detail.js', import.meta.url), 'utf8');
assert.match(detailJs, /openCompactCaregiverCheckinPrintWindow/);
assert.doesNotMatch(detailJs, /function printableCheckinHtml/);
assert.doesNotMatch(detailJs, /window\.print\(\)/);

const reportHtml = await readFile(new URL('./caregiver-report.html', import.meta.url), 'utf8');
assert.match(reportHtml, /import \{ openCompactCaregiverCheckinPrintWindow \} from '\.\/caregiver-checkin-print\.js/);
assert.match(reportHtml, /function printCheckinRecords\(records, title = 'Caregiver Check-Ins'\)[\s\S]*openCompactCaregiverCheckinPrintWindow\(selected, \{ title \}\)/);
assert.doesNotMatch(reportHtml, /function renderCheckinPrintRecordHtml/);

console.log('caregiver check-in shared print renderer: PASS');
