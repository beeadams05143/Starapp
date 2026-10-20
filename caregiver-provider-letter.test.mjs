import assert from 'node:assert/strict';
import { analyzeProviderRecords as analyze, renderProviderLetter, analyzeNotes, originalNotes } from './caregiver-provider-letter.js';
import { optionalEngagement, optionalYesNo } from './caregiver-answer-quality.js';
import { normalizeSupabaseEntry } from './caregiver-report-supabase.js';

const scope = { start: '2026-10-01', end: '2026-10-14', groupId: 'test-group' };
let serial = 0;
const row = (day, payload = {}, extras = {}) => ({
  id: `synthetic-${++serial}`, group_id: scope.groupId, date: `2026-10-${String(day).padStart(2, '0')}`,
  payload: { answer_quality_version: 1, ...payload }, ...extras,
});
for (const blank of [null, undefined, '', ' ']) { assert.equal(optionalEngagement(blank), null); assert.equal(optionalYesNo(blank), null); }
assert.equal(optionalEngagement('0'), 0);
assert.equal(optionalYesNo('no'), 'no'); assert.equal(optionalYesNo('yes'), 'yes');
assert.equal(optionalEngagement('10'), null);

const sleep = day => row(day, { sleep_onset_difficulty: true });
const entries = [sleep(1), row(2, { mood_engagement: '1' }), sleep(4), row(5, { mood_engagement: '1' }), row(5, { mood_engagement: '0' }),
  sleep(7), row(8, { mood_engagement: '2' }), sleep(10), row(11, { mood_engagement: '1' }),
  row(13, { sleep_onset_difficulty: false, night_wake_flag: 'no', caregiver_notes: 'Enjoyed the library visit and chose a book independently.' }),
  row(14, { mood_engagement: '0', caregiver_notes: 'Asked for a break, then returned to cooking.' }),
];
entries.push({ ...entries[0] }); // same ID copy, never another check-in
entries.push(row(8, { caregiver_notes: 'PRIVATE FOREIGN NOTE' }, { group_id: 'another-group' }));
let a = analyze(entries, scope);
assert.equal(a.rows.length, 11); assert.equal(a.days.length, 10); assert.equal(a.missingDays, 4);
assert.equal(a.duplicateCopies, 1); assert.equal(a.multipleEntryDays, 1);
assert.equal(a.metrics.engagement.mixed, 1);
assert.deepEqual(a.sleepGaps, [3, 3, 3]); assert.ok(a.regularSpacing);
assert.deepEqual(a.following.afterSleep, { total: 3, reduced: 3 });
assert.deepEqual(a.following.afterNoSleep, { total: 1, reduced: 0 });
let letter = renderProviderLetter(a);
assert.match(letter, /does not establish a sleep cycle/);
assert.match(letter, /too sparse to support an association/);
assert.doesNotMatch(letter, /PRIVATE FOREIGN NOTE|Thank you for trusting|caused reduced/);
assert.match(letter, /Strengths and Successes/); assert.match(letter, /library visit/);
assert.equal(analyze([sleep(1), sleep(3), sleep(8), sleep(13)], scope).regularSpacing, false);
assert.equal(analyze([sleep(1), sleep(4), sleep(7)], scope).regularSpacing, false);
assert.equal(analyze([sleep(1), sleep(2), sleep(3)], scope).sleepClusters, 2);
assert.equal(analyze([sleep(1), row(3, { mood_engagement: '2' })], scope).following.afterSleep.total, 0);

const historical = row(1, { answer_quality_version: undefined, mood_engagement: '0', appetite_change_flag: 'No', prn_used_today: 'no' });
a = analyze([historical, row(2, { mood_engagement: null, appetite_change_flag: null, prn_used_today: null }),
  row(3, { mood_engagement: '0', appetite_change_flag: 'no', prn_used_today: 'no' })], scope);
for (const key of ['engagement', 'appetite', 'prn']) assert.equal(a.metrics[key].answered, 1);
assert.equal(a.historical, 1);

const notes = [
  row(1, { caregiver_notes: 'Needed extra breaks and stayed away from the group.' }),
  row(7, { physical_notes: 'Took longer breaks and joined fewer activities.' }),
  row(8, { caregiver_notes: 'The outing was not successful. Did not enjoy the outing. Maybe restless. Staff felt happy.' }),
  row(9, { caregiver_notes: 'Enjoyed painting.' }),
  row(10, { caregiver_notes: 'Enjoyed painting.' }),
];
const noteAnalysis = analyzeNotes(notes);
assert.equal(noteAnalysis.themes.find(t => t.name === 'reduced participation').dates.length, 2);
assert.equal(noteAnalysis.themes.find(t => t.name === 'positive experiences').dates.length, 2);
assert.equal(noteAnalysis.themes.find(t => t.name === 'positive experiences').distinctWording, 1);
for (const quote of noteAnalysis.quotes) assert.equal(quote.quote, quote.text.slice(quote.start, quote.end));
letter = renderProviderLetter(analyze(notes, scope));
assert.match(letter, /Oct 1, 2026: “Needed extra breaks and stayed away from the group\.”/);
assert.match(letter, /may have been copied forward/);
assert.doesNotMatch(renderProviderLetter(analyze(notes, scope), { includeQuotes: false }), /“/);
const normalized = normalizeSupabaseEntry(row(8, { caregiver_notes: 'Payload original.' }, { caregiver_notes: 'Root original.' }));
assert.deepEqual(originalNotes(normalized).map(q => q.text), ['Payload original.', 'Root original.']);

const prn = { medication: 'Synthetic medication', time: '18:00', reason: 'Synthetic reason' };
a = analyze([row(7, { prn_entries: [prn], prn_used_today: 'yes' }),
  row(7, { prn_entries: [prn], prn_used_today: 'yes' }),
  row(8, { prn_used_today: 'yes' })], scope);
assert.equal(a.prnEntries.length, 2); assert.equal(a.metrics.prn.positive, 2);
assert.equal(a.possibleRepeatedPrn, 1);
assert.match(renderProviderLetter(a), /distinct administrations is uncertain/);
assert.throws(() => analyze([row(1, {}, { individual_id: 'a' }), row(1, {}, { individual_id: 'b' })], scope), /Choose one individual/);
a = analyze([row(1, { caregiver_notes: 'First person.' }, { individual_id: 'a' }),
  row(1, { caregiver_notes: 'Second person.' }, { individual_id: 'b' }),
  row(1, { caregiver_notes: 'Unassigned person.' })], { ...scope, individualId: 'a' });
assert.equal(a.rows.length, 1);
assert.throws(() => analyze([], { ...scope, groupId: '' }), /active group/);
const comparison = Array.from({ length: 14 }, (_, i) => row(i + 1, { mood_pacing: i < 7 ? 'frequent' : 'none' }));
assert.match(renderProviderLetter(analyze(comparison, scope)), /Pacing was reported less often/);
assert.match(renderProviderLetter(analyze([], scope)), /insufficient/);

const prior = process.env.TZ;
try {
  for (const zone of ['UTC', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    process.env.TZ = zone;
    const dates = ['2026-09-30', '2026-10-01', '2026-10-07', '2026-10-08', '2026-11-01'];
    const legacy = dates.map((date, i) => row(1, { entry_date: date, caregiver_notes: `Enjoyed synthetic activity ${i}.` }, { date: null, created_at: '2026-10-20T12:00:00Z' }));
    assert.deepEqual(analyze(legacy, { ...scope, start: '2026-09-30', end: '2026-11-01' }).days.map(d => d.date), dates);
    const unknownDate = row(1, {}, { date: null, created_at: '2026-10-08T12:00:00Z' });
    assert.equal(analyze([unknownDate], scope).days.length, 0);
    const conflictingDate = row(7, { entry_date: '2026-10-08', caregiver_notes: 'Enjoyed painting.' });
    assert.equal(analyze([conflictingDate], scope).dateConflicts, 1);
    assert.equal(analyze([conflictingDate], scope).notes.quotes.length, 0);
  }
} finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
console.log('Provider narrative: intervals, coverage, conflicts, provenance, privacy, quality, PRN, comparisons, and dates: PASS');
