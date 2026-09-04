import assert from 'node:assert/strict';
import {
  collectNotableActivities,
  filterParentLetterEntries,
  formatBehaviorFindings,
  participationSentence,
  summarizeBehaviorForParentLetter,
  summarizeParticipationForParentLetter,
} from './caregiver-parent-letter.js';

const rangeSeptOneToFour = {
  start: new Date('2026-09-01T12:00:00'),
  end: new Date('2026-09-04T12:00:00'),
  startInput: '2026-09-01',
  endInput: '2026-09-04',
  label: 'September 1, 2026 - September 4, 2026',
};

const partialCommunityEntries = [
  { id: '1', date: '2026-09-01', community_time: 60 },
  { id: '2', date: '2026-09-02', community_time: 30 },
  { id: '3', date: '2026-09-03', community_time: 30 },
  { id: 'outside', date: '2026-08-31', community_time: 600 },
];
const filteredCommunity = filterParentLetterEntries(partialCommunityEntries, rangeSeptOneToFour);
assert.equal(filteredCommunity.length, 3);
const communitySummary = summarizeParticipationForParentLetter(filteredCommunity, rangeSeptOneToFour, 'community');
assert.equal(communitySummary.totalMinutes, 120);
assert.equal(communitySummary.totalHoursText, '2 hours');
assert.equal(communitySummary.observedEntries, 3);
assert.equal(communitySummary.shouldReportWeeklyAverage, false);
const communitySentence = participationSentence('Community', communitySummary);
assert.match(communitySentence, /Community participation totaled 2 hours across the 3 caregiver check-ins/);
assert.doesNotMatch(communitySentence, /3\.5 hours per week/);

const longerRange = {
  start: new Date('2026-09-01T12:00:00'),
  end: new Date('2026-09-14T12:00:00'),
  startInput: '2026-09-01',
  endInput: '2026-09-14',
};
const longerSummary = summarizeParticipationForParentLetter([{ date: '2026-09-02', vocational_time: 420 }], longerRange, 'vocational');
assert.equal(longerSummary.shouldReportWeeklyAverage, true);
assert.equal(longerSummary.weeklyAverageText, '3.5 hours');

const behaviorRows = [
  {
    id: 'legacy',
    date: '2026-09-01',
    payload: {},
  },
  {
    id: 'withdrawn',
    date: '2026-09-02',
    payload: {
      behavior_tracking: [
        { item_key: 'withdrawal_present', behavior_name: 'Withdrawal present', occurred: true },
        { item_key: 'pressured_speech_present', behavior_name: 'Talking very fast or hard to interrupt', occurred: false },
      ],
    },
  },
  {
    id: 'rapid',
    date: '2026-09-03',
    payload: {
      mood_speech: 'rapid_pressured',
      mood_attention: 'typical',
      mood_engagement_score: 1,
    },
  },
];
const behaviorSummary = summarizeBehaviorForParentLetter(behaviorRows);
const withdrawal = behaviorSummary.find((item) => item.key === 'withdrawal_present');
const rapidSpeech = behaviorSummary.find((item) => item.key === 'pressured_speech_present');
const focus = behaviorSummary.find((item) => item.key === 'focus_trouble_flag');
assert.deepEqual(
  { yes: withdrawal.yes, answered: withdrawal.answered },
  { yes: 1, answered: 2 },
  'missing legacy withdrawal fields must not count as No'
);
assert.deepEqual(
  { yes: rapidSpeech.yes, answered: rapidSpeech.answered },
  { yes: 1, answered: 2 },
  'pressured speech should combine current behavior_tracking and mood_speech signals'
);
assert.deepEqual(
  { yes: focus.yes, answered: focus.answered },
  { yes: 0, answered: 1 },
  'percent denominators use answered/applicable records only'
);
const behaviorLines = formatBehaviorFindings(behaviorSummary);
assert.ok(behaviorLines.some((line) => /withdrawal\/low engagement on 1 of 2 applicable/.test(line)));
assert.ok(behaviorLines.some((line) => /pressured\/rapid speech on 1 of 2 applicable/.test(line)));

const activities = collectNotableActivities([
  {
    id: 'a',
    date: '2026-09-02',
    payload: {
      public_activity_type: ['Santa’s Village'],
      public_activity_note: "Went to Santa's Village and it was a successful outing.",
    },
  },
  {
    id: 'b',
    date: '2026-09-03',
    payload: {
      caregiver_notes: 'Visited the library.',
    },
  },
]);
assert.equal(activities.length, 2, 'structured and narrative references to the same outing should deduplicate');
assert.ok(activities.some((activity) => /Santa/.test(activity.label) && activity.successful));
assert.ok(activities.some((activity) => /library/i.test(activity.label)));

console.log('caregiver parent letter calculations: PASS');
