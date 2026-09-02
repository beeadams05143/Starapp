import assert from 'node:assert/strict';
import { normalizeCaregiverCheckinForCalendar } from './caregiver-report-shared.js';

const historical = normalizeCaregiverCheckinForCalendar({
  id: 'old-1',
  date: '2026-09-02',
  had_bm: true,
  payload: {
    hours_sleep: '7',
    prn_given: 'yes',
    prn_used_for_sleep_disturbance: 'yes',
    manic_flag: 'yes',
  },
});

assert.equal(historical.dateKey, '2026-09-02');
assert.equal(historical.flags.bm, true);
assert.equal(historical.flags.sleep, 7);
assert.equal(historical.flags.sleep_low, true);
assert.equal(historical.flags.prn_sleep, true);
assert.equal(historical.flags.manic, true);
assert.equal(historical.hasObservations, true);

const prnNo = normalizeCaregiverCheckinForCalendar({
  id: 'new-prn-no',
  submitted_at: '2026-09-02T23:30:00-04:00',
  payload: {
    entry_date: '2026-09-02',
    caregiver_name: 'Caregiver A',
    prn_used_today: 'no',
    prn_entries: [],
    section_statuses: { physical: { status: 'all_clear' } },
  },
});

assert.equal(prnNo.dateKey, '2026-09-02');
assert.equal(prnNo.flags.prn_sleep, false);
assert.equal(prnNo.flags.prn_aggr, false);
assert.match(prnNo.flags.med_change_notes.join('\n'), /Caregiver check-in \(Caregiver A\): recorded/);
assert.match(prnNo.flags.med_change_notes.join('\n'), /PRN: no/);
assert.equal(prnNo.hasObservations, true);

const mood = normalizeCaregiverCheckinForCalendar({
  id: 'new-mood',
  date: '2026-09-03',
  payload: {
    mood_engagement_score: 3,
    mood_attention: 'frequently_loses_focus',
    mood_speech: 'rapid_pressured',
    mood_pacing: 'frequent',
  },
});

assert.equal(mood.dateKey, '2026-09-03');
assert.equal(mood.flags.manic, true);
assert.match(mood.flags.med_change_notes.join('\n'), /Mood\/regulation: engagement 3/);

const prnEntry = normalizeCaregiverCheckinForCalendar({
  id: 'new-prn-yes',
  date: '2026-09-04',
  payload: {
    prn_used_today: 'yes',
    prn_entries: [{ time: '20:15', medication: 'PRN med', reason: 'anxiety and pacing', notes: 'settled after walk' }],
  },
});

assert.equal(prnEntry.dateKey, '2026-09-04');
assert.equal(prnEntry.flags.prn_aggr, true);
assert.equal(prnEntry.flags.prn_sleep, false);
assert.match(prnEntry.flags.med_change_notes.join('\n'), /PRN: 1 recorded/);

const participation = normalizeCaregiverCheckinForCalendar({
  id: 'new-adl',
  date: '2026-09-05',
  payload: {
    vocational_participation: 'yes',
    vocational_time: '30-60 min',
    home_activity_flag: 'yes',
    home_activity_time: '15-30 min',
    adl_entries: [
      { category: 'Cleaning / Household', activity: 'Brought dishes to sink' },
      { category: 'Dressing', activity: 'Tied shoes' },
    ],
  },
});

assert.equal(participation.dateKey, '2026-09-05');
assert.equal(participation.source.vocationalMinutes, 60);
assert.equal(participation.source.homeMinutes, 30);
assert.match(participation.flags.med_change_notes.join('\n'), /Participation: vocational, home, 2 ADL tasks/);
assert.equal(participation.hasObservations, true);

console.log('caregiver calendar normalization: PASS');
