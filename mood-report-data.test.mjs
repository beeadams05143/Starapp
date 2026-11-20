import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchMoodReportRows } from './mood-report-data.js';

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
  assert.equal(entries[0].intensity, null);
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
