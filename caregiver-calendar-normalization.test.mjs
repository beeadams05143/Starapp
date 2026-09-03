import assert from 'node:assert/strict';
import { normalizeCaregiverCheckinForCalendar } from './caregiver-report-shared.js';

const text = (record) => record.flags.summary_lines.join('\n');

const stable = normalizeCaregiverCheckinForCalendar({
  id: 'stable-1',
  date: '2026-09-01',
  payload: {
    caregiver_name: 'Josh',
    prn_used_today: 'no',
    mood_energy: 'typical',
    mood_speech: 'typical',
    mood_attention: 'typical',
    mood_pacing: 'none',
    mood_irritability: 'none',
  },
});
assert.equal(stable.dateKey, '2026-09-01');
assert.equal(stable.flags.prn, false);
assert.equal(stable.flags.sleep_concern, false);
assert.match(text(stable), /^Josh\nNo notable concerns$/);
assert.doesNotMatch(text(stable), /recorded|PRN: no|typical|none/);

const engagementOne = normalizeCaregiverCheckinForCalendar({
  id: 'eng-1',
  date: '2026-09-02',
  payload: {
    caregiver_name: 'Shirley',
    mood_engagement_score: 1,
    mood_attention: 'some_difficulty',
    vocational_participation: 'yes',
    public_activity_flag: 'yes',
  },
});
assert.match(text(engagementOne), /Shirley/);
assert.match(text(engagementOne), /Some trouble focusing/);
assert.match(text(engagementOne), /Engagement 1 · Less engaged/);
assert.match(text(engagementOne), /Vocational \+ Community/);

const engagementThree = normalizeCaregiverCheckinForCalendar({
  id: 'eng-3',
  date: '2026-09-03',
  payload: {
    mood_engagement_score: 3,
    mood_attention: 'frequently_loses_focus',
  },
});
assert.match(text(engagementThree), /Frequently loses focus/);
assert.match(text(engagementThree), /Engagement 3 · Highly withdrawn/);

const rapidSpeech = normalizeCaregiverCheckinForCalendar({
  id: 'rapid',
  date: '2026-09-04',
  payload: {
    mood_speech: 'rapid_pressured',
  },
});
assert.equal(rapidSpeech.flags.anomaly, true);
assert.match(text(rapidSpeech), /Rapid\/pressured speech/);
assert.doesNotMatch(text(rapidSpeech), /rapid_pressured/);

const energyPacing = normalizeCaregiverCheckinForCalendar({
  id: 'energy-pacing',
  date: '2026-09-05',
  payload: {
    caregiver_name: 'Beth',
    mood_energy: 'high',
    mood_pacing: 'frequent',
    mood_engagement_score: 2,
    prn_used_today: 'yes',
    prn_entries: [{ time: '14:15', medication: 'PRN med', reason: 'anxiety and pacing' }],
  },
});
assert.equal(energyPacing.flags.prn, true);
assert.equal(energyPacing.flags.prn_aggr, true);
assert.match(text(energyPacing), /Beth/);
assert.match(text(energyPacing), /Higher energy/);
assert.match(text(energyPacing), /Frequent pacing/);
assert.match(text(energyPacing), /PRN 2:15 PM/);

const multiplePrns = normalizeCaregiverCheckinForCalendar({
  id: 'multi-prn',
  date: '2026-09-06',
  payload: {
    prn_used_today: 'yes',
    prn_entries: [
      { time: '09:30', medication: 'PRN med', reason: 'sleep' },
      { time: '14:15', medication: 'PRN med', reason: 'pacing' },
    ],
  },
});
assert.equal(multiplePrns.flags.prn, true);
assert.match(text(multiplePrns), /PRNs 9:30 AM, 2:15 PM/);

const physical = normalizeCaregiverCheckinForCalendar({
  id: 'physical',
  date: '2026-09-07',
  had_bm: true,
  payload: {
    hours_sleep: '6.5',
    appears_good_health: 'no',
    appetite_change: 'less',
    med_change_flag: 'yes',
    med_change_note: 'New evening dose',
  },
});
assert.equal(physical.flags.bm, true);
assert.equal(physical.flags.sleep_concern, true);
assert.equal(physical.flags.illness, true);
assert.equal(physical.flags.appetite, true);
assert.equal(physical.flags.med_change, true);
assert.match(text(physical), /Sleep concern/);
assert.match(text(physical), /Illness\/discomfort/);

const legacyPrn = normalizeCaregiverCheckinForCalendar({
  id: 'old-prn',
  date: '2026-09-08',
  payload: {
    prn_given: 'yes',
    prn_used_for_sleep_disturbance: 'yes',
    prn_used_for_mania: 'yes',
    prn_used_for_aggression: 'yes',
  },
});
assert.equal(legacyPrn.flags.prn, true);
assert.equal(legacyPrn.flags.prn_sleep, true);
assert.equal(legacyPrn.flags.prn_mania, true);
assert.equal(legacyPrn.flags.prn_aggr, true);
assert.match(text(legacyPrn), /PRN used/);

const legacyManic = normalizeCaregiverCheckinForCalendar({
  id: 'old-manic',
  date: '2026-09-09',
  payload: {
    manic_flag: 'yes',
  },
});
assert.equal(legacyManic.flags.anomaly, true);
assert.equal(legacyManic.flags.manic, true);
assert.match(text(legacyManic), /Legacy elevated signal/);
assert.doesNotMatch(text(legacyManic), /^Manic$/m);

const secondCaregiverSameDay = normalizeCaregiverCheckinForCalendar({
  id: 'same-day-2',
  date: '2026-09-05',
  payload: {
    caregiver_name: 'Jordan',
    public_activity_flag: 'yes',
  },
});
assert.match(text(secondCaregiverSameDay), /^Jordan\nCommunity$/);

console.log('caregiver calendar normalization: PASS');
