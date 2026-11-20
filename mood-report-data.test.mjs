import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMoodTrend, fetchMoodReportRows } from './mood-report-data.js';

const scope = { groupId: 'family', individualId: 'person', userId: 'staff', range: 'month', now: new Date(2026, 10, 19, 21) };
const row = { id: 'saved', group_id: 'family', user_id: 'person', date: '2026-11-19', mood: '😊 Happy' };

test('reads saved report rows for the active group, person and local care dates', async () => {
  const entries = await fetchMoodReportRows(async (path, options) => {
    const query = new URLSearchParams(path.split('?')[1]);
    assert.equal(query.get('group_id'), 'eq.family');
    assert.equal(query.get('user_id'), 'eq.person');
    assert.deepEqual(query.getAll('date'), ['gte.2026-11-01', 'lte.2026-11-19']);
    assert.equal(options.expectedUserId, 'staff');
    return [row, { ...row, group_id: 'other-team' }, { ...row, user_id: 'other-person' },
      { ...row, date: '2026-10-31' }, { ...row, date: '2026-11-20' }];
  }, scope);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].dateObj.getDate(), 19);
  assert.equal(entries[0].mood, '😊 Happy');
  assert.equal(Object.hasOwn(entries[0], 'intensity'), false);
});

test('paginates the existing mood history and keeps distinct check-ins on the same day', async () => {
  const offsets = [];
  const entries = await fetchMoodReportRows(async path => {
    const query = new URLSearchParams(path.split('?')[1]);
    offsets.push(query.get('offset'));
    return offsets.length === 1
      ? Array.from({ length: 500 }, (_, index) => ({ ...row, id: 'saved-' + index }))
      : [{ ...row, id: 'saved' }];
  }, { ...scope, range: 'all' });
  assert.deepEqual(offsets, ['0', '500']);
  assert.equal(entries.length, 501);
  assert.equal(entries[0].id, 'saved');
});

test('missing scope makes no request and a denied request surfaces an error', async () => {
  assert.deepEqual(await fetchMoodReportRows(() => { throw Error('Must not fetch'); }, { ...scope, individualId: '' }), []);
  await assert.rejects(fetchMoodReportRows(async () => { throw Error('Access denied'); }, scope), /Access denied/);
});

test('preserves shared notes and supports legacy notes and blank entries', async () => {
  const entries = await fetchMoodReportRows(async () => [
    { ...row, id: 'typed', notes: 'A good day\nWent swimming' },
    { ...row, id: 'legacy', note: 'Rested at home' },
    { ...row, id: 'blank', notes: null },
  ], scope);
  assert.deepEqual(entries.map(entry => entry.notes), ['', 'Rested at home', 'A good day\nWent swimming']);
});

test('counts each reported mood and keeps gaps between care dates', () => {
  const trend = buildMoodTrend([
    { date: '2026-11-21', mood: 'Sad' },
    { date: '2026-11-19', mood: 'Happy' },
    { date: '2026-11-19', mood: 'Happy' },
    { date: '2026-11-19', mood: 'Okay' },
  ]);
  assert.equal(trend.period, 'day');
  assert.equal(trend.labels.length, 3);
  assert.deepEqual(trend.series, [
    { mood: 'Happy', counts: [2, 0, 0] },
    { mood: 'Okay', counts: [1, 0, 0] },
    { mood: 'Sad', counts: [0, 0, 1] },
  ]);
});

test('groups longer histories by calendar week or month', () => {
  const happy = date => ({ date, mood: 'Happy' });
  const weekly = buildMoodTrend([happy('2026-11-19'), happy('2026-11-22'), happy('2026-12-24')]);
  assert.equal(weekly.period, 'week');
  assert.deepEqual(weekly.series[0].counts, [2, 0, 0, 0, 0, 1]);
  const monthly = buildMoodTrend([happy('2026-11-19'), happy('2027-03-31'), happy('2027-03-01')]);
  assert.equal(monthly.period, 'month');
  assert.deepEqual(monthly.series[0].counts, [1, 0, 0, 0, 2]);
  assert.deepEqual(buildMoodTrend([]).series, []);
});
