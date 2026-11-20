import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMoodTrend, fetchUvmMoodRows } from './mood-report-data.js';

const scope = { groupId: 'uvm-team', userId: 'tester', range: 'month', now: new Date(2026, 10, 19, 21) };
const row = {
  id: 'check-in', group_id: scope.groupId, checkin_date: '2026-11-19', response_type: 'mood',
  response_value: 'Okay', original_words: 'I want some quiet.\nI liked my walk.', is_fictional: true,
};

test('loads fictional mood responses and their original words for the active UVM team', async () => {
  const entries = await fetchUvmMoodRows(async (path, options) => {
    const [table, query] = path.split('?');
    const params = new URLSearchParams(query);
    assert.equal(table, 'star_individual_checkins_test');
    assert.equal(params.get('group_id'), 'eq.uvm-team');
    assert.equal(params.get('response_type'), 'eq.mood');
    assert.equal(params.get('is_fictional'), 'eq.true');
    assert.deepEqual(params.getAll('checkin_date'), ['gte.2026-11-01', 'lte.2026-11-19']);
    assert.equal(options.expectedUserId, 'tester');
    return [row, { ...row, group_id: 'other' }, { ...row, is_fictional: false },
      { ...row, response_type: 'comfort' }, { ...row, response_value: 'Not now' },
      { ...row, checkin_date: '2026-10-31' }, { ...row, checkin_date: '2026-11-20' }];
  }, scope);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].mood, 'Okay');
  assert.equal(entries[0].notes, row.original_words);
  assert.equal(entries[0].dateObj.getDate(), 19);
});

test('paginates UVM mood responses and counts multiple check-ins on the same day', async () => {
  const offsets = [];
  const entries = await fetchUvmMoodRows(async path => {
    offsets.push(new URLSearchParams(path.split('?')[1]).get('offset'));
    return offsets.length === 1
      ? Array.from({ length: 500 }, (_, index) => ({ ...row, id: 'row-' + index }))
      : [{ ...row, id: 'older', checkin_date: '2026-11-17', response_value: 'Happy', original_words: '' }];
  }, scope);
  assert.deepEqual(offsets, ['0', '500']);
  assert.equal(entries[0].notes, '');
  const trend = buildMoodTrend(entries);
  assert.equal(trend.period, 'day');
  assert.deepEqual(trend.series, [
    { mood: 'Happy', counts: [1, 0, 0] },
    { mood: 'Okay', counts: [0, 0, 500] },
  ]);
});

test('groups longer histories by calendar week and month', () => {
  const happy = date => ({ date, mood: 'Happy' });
  const weekly = buildMoodTrend([happy('2026-11-19'), happy('2026-11-22'), happy('2026-12-24')]);
  assert.equal(weekly.period, 'week');
  assert.deepEqual(weekly.series[0].counts, [2, 0, 0, 0, 0, 1]);
  const monthly = buildMoodTrend([happy('2026-11-19'), happy('2027-03-31')]);
  assert.equal(monthly.period, 'month');
  assert.deepEqual(monthly.series[0].counts, [1, 0, 0, 0, 1]);
  assert.deepEqual(buildMoodTrend([]).series, []);
});
