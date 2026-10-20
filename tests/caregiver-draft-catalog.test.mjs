import test from 'node:test';
import assert from 'node:assert/strict';
import { draftCatalog, chooseDraft } from '../caregiver-draft-catalog.js';

const context = { userId: 'beth-auth-id', groupId: 'ben-group', practice: false, caregiverLabel: 'countrygirlinvt' };
const make = (key, date, extras = {}) => ({
  key, context, updatedAt: '2026-10-09T13:00:00Z',
  draft: { data: [{ entry_date: date }] }, phase: 'draft', ...extras,
});

test('Thursday date stays Thursday when edited on Friday', () => {
  const [draft] = draftCatalog([make('thursday', '2026-10-08')], context);
  assert.equal(draft.date, '2026-10-08');
  assert.equal(draft.dateLabel, 'Thursday, October 8, 2026');
  assert.equal(draft.caregiverName, 'countrygirlinvt');
});

test('two distinct drafts remain distinct', () => {
  const items = draftCatalog([make('one', '2026-10-08'), make('two', '2026-10-09')], context);
  assert.deepEqual(items.map(x => x.key), ['one', 'two']);
  assert.equal(chooseDraft(items, 'one').date, '2026-10-08');
});

test('other accounts, groups, and practice entries are not displayed', () => {
  const items = [make('mine', '2026-10-08'),
    make('other', '2026-10-08', { context: { ...context, userId: 'josh-auth-id' } }),
    make('group', '2026-10-08', { context: { ...context, groupId: 'other-group' } }),
    make('practice', '2026-10-08', { context: { ...context, practice: true } })];
  assert.deepEqual(draftCatalog(items, context).map(x => x.key), ['mine']);
});

test('uncertain submissions require verification rather than resubmission', () => {
  const items = draftCatalog([make('pending', '2026-10-08', { attempt: { sent: true } })], context);
  assert.equal(items[0].canContinue, false);
  assert.equal(items[0].canCheckSaveStatus, true);
  assert.throws(() => chooseDraft(items, 'pending'), /Check save status/);
});

test('verified submissions and missing context are excluded', () => {
  assert.deepEqual(draftCatalog([make('done', '2026-10-08', { phase: 'verified' })], context), []);
  assert.deepEqual(draftCatalog([make('one', '2026-10-08')], { groupId: 'ben-group' }), []);
});
