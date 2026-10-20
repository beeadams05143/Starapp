import test from 'node:test';
import assert from 'node:assert/strict';
import { CaregiverDraftService } from '../caregiver-draft-service.js';

const userId = '11111111-1111-4111-8111-111111111111';
const groupId = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const context = { userId, groupId };

test('list excludes records outside authenticated caregiver and group', async () => {
  const service = new CaregiverDraftService({ ...context, request: async () => [
    { id, author_user_id: userId, group_id: groupId },
    { id: 'other', author_user_id: 'someone-else', group_id: groupId },
  ] });
  assert.equal((await service.list()).length, 1);
});

test('create keeps Thursday date even if saved Friday', async () => {
  const requests = [];
  const service = new CaregiverDraftService({ ...context, request: async (path, options) => {
    requests.push({ path, options });
    if (options?.method === 'POST') return [{ ...JSON.parse(options.body)[0], version: 1 }];
    return [{ id, author_user_id: userId, group_id: groupId, checkin_date: '2026-10-08', version: 1 }];
  } });
  const result = await service.create({ id, date: '2026-10-08', data: { answers: {} }, caregiverName: 'countrygirlinvt' });
  assert.equal(result.checkin_date, '2026-10-08');
  assert.equal(JSON.parse(requests[0].options.body)[0].author_display_name_snapshot, 'countrygirlinvt');
});

test('update uses optimistic concurrency and rejects stale version', async () => {
  const calls = [];
  const service = new CaregiverDraftService({ ...context, request: async (path, options) => {
    calls.push({ path, options }); return [];
  } });
  await assert.rejects(() => service.update({ id, version: 2, date: '2026-10-08', data: {} }), /not confirmed/);
  assert.match(calls[0].path, /version=eq.2/);
  assert.equal(JSON.parse(calls[0].options.body).version, 3);
});

test('invalid date is rejected before sending any request', async () => {
  const service = new CaregiverDraftService({ ...context, request: async () => { throw Error('must not call'); } });
  await assert.rejects(() => service.create({ id, date: '2026-02-30', data: {} }), /Invalid check-in date/);
});
