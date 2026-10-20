import assert from 'node:assert/strict';
import { checkinDateKey, normalizeCheckinDate, formatCheckinDate } from './caregiver-dates.js';
import { loadCalendarCheckins, calendarEmptyLabel } from './caregiver-calendar-data.js';
import { normalizeSupabaseEntry } from './caregiver-report-supabase.js';
import { normalizeCaregiverCheckinForCalendar } from './caregiver-report-shared.js';

const originalTZ = process.env.TZ;
try {
  for (const tz of ['America/New_York', 'America/Los_Angeles', 'UTC', 'Europe/London', 'Asia/Kolkata', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    process.env.TZ = tz;
    for (const [date, label] of [['2026-10-01', 'Thu, Oct 1'], ['2026-10-07', 'Wed, Oct 7'], ['2026-10-08', 'Thu, Oct 8'], ['2026-09-30', 'Wed, Sep 30'], ['2026-11-01', 'Sun, Nov 1']]) {
      assert.equal(formatCheckinDate(date, 'en-US'), label, tz);
      for (const row of [{ date }, { date: null, payload: { entry_date: date } }]) {
        const normalized = normalizeSupabaseEntry({ id: 'test', ...row });
        assert.equal(normalized.date, date, tz);
        assert.equal(normalizeCaregiverCheckinForCalendar(normalized).dateKey, date, tz);
      }
    }
    assert.equal(checkinDateKey({ payload: { entry_date: '10/8/2026' } }), '2026-10-08');
    assert.equal(checkinDateKey({ submitted_at: '2026-10-08T12:00:00Z', created_at: '2026-10-01T00:00:00Z' }), '');
    assert.equal(normalizeCheckinDate('2026-02-30'), '');
    assert.equal(normalizeCheckinDate('2026-13-01'), '');
    assert.equal(normalizeCheckinDate('2024-02-29'), '2024-02-29');
  }
} finally {
  if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ;
}

const row = (id, date, group_id = 'g1', payload = {}) => ({ id, date, group_id, payload });
const october = [row('one', '2026-10-01'), row('seven', '2026-10-07'), row('eight', null, 'g1', { entry_date: '2026-10-08' })];
const args = { groupId: 'g1', startDate: '2026-10-01', endDate: '2026-11-01' };
let calls = [];
const request = async path => {
  calls.push(path);
  assert.match(path, /group_id=eq.g1&/);
  return path.includes('date=is.null') ? [october[2], row('outside', null, 'g1', { entry_date: '2026-11-01' })] : [october[0], october[1], row('foreign', '2026-10-08', 'g2')];
};
let result = await loadCalendarCheckins({ ...args, request, reportRows: [row('cache-foreign', '2026-10-08', 'g2')] });
assert.deepEqual(result.rows.map(r => r.date), ['2026-10-01', '2026-10-07', '2026-10-08']);
assert.equal(result.complete, true);
assert.equal(result.legacy, 1);
assert.equal(calendarEmptyLabel(result, '2026-10-09', '2026-10-19', false), 'No check-in recorded');
assert.equal(calendarEmptyLabel(result, '2026-10-08', '2026-10-19', true), '—');

// The independent fallback runs after either primary or legacy-query failure.
for (const failure of ['primary', 'legacy']) {
  calls = [];
  result = await loadCalendarCheckins({ ...args, request: async path => {
    calls.push(path);
    assert.match(path, /group_id=eq.g1&/);
    if ((failure === 'primary' && path.includes('date=gte')) || (failure === 'legacy' && path.includes('date=is.null'))) throw Error('offline');
    return october;
  } });
  assert.equal(result.complete, true);
  assert.equal(result.rows.length, 3);
  assert.ok(calls.some(path => !path.includes('date=')));
}
result = await loadCalendarCheckins({ ...args, request: async () => { throw Error('offline'); }, reportRows: [october[0], row('foreign', '2026-10-08', 'g2')] });
assert.equal(result.complete, false);
assert.deepEqual(result.rows.map(r => r.id), ['one']);
assert.match(calendarEmptyLabel(result, '2026-10-08', '2026-10-19', false), /could not be fully loaded/);
result = await loadCalendarCheckins({ ...args, request: async () => [row('undated', null, 'g1', {})] });
assert.equal(result.unresolved, 1);
assert.equal(calendarEmptyLabel(result, '2026-10-08', '2026-10-19', false), 'Check-in date needs review');
result = await loadCalendarCheckins({ ...args, groupId: null, request: () => { throw Error('must not query'); } });
assert.equal(result.complete, false);

// Pagination must finish before declaring days empty.
let pages = 0;
result = await loadCalendarCheckins({ ...args, request: async path => {
  if (path.includes('date=is.null')) return [];
  pages++;
  return path.includes('offset=0') ? Array.from({ length: 1000 }, (_, i) => row(`p${i}`, '2026-10-01')) : [row('last', '2026-10-08')];
} });
assert.equal(pages, 2);
assert.equal(result.rows.length, 1001);
console.log('Calendar dates, legacy rows, failure recovery, isolation, and timezone regressions: PASS');

// Exercise the actual inline heading/editor code, retaining the selected save key.
const { readFile } = await import('node:fs/promises');
const vm = await import('node:vm');
const html = await readFile(new URL('./caregiver-report.html', import.meta.url), 'utf8');
const humanDateSource = html.match(/const humanDate = .*?;/)[0];
const editorSource = html.slice(html.indexOf('  function openEditor(dateKey){'), html.indexOf('  function closeEditor(){'));
const context = vm.createContext({
  formatCheckinDate: key => formatCheckinDate(key, 'en-US'),
  editorOverlay: { classList: { remove() {} } }, editorForm: { reset() {}, elements: {} },
  editorDateLabel: {}, editorSleep: {}, editorNotes: {}, editorQuick: {},
  HEALTH_FLAGS: {}, MAP: {}, isFullMoonKey: () => false
});
vm.runInContext(`let editorDateKey = null; ${humanDateSource}\n${editorSource}\nopenEditor('2026-10-08');`, context);
assert.equal(context.editorDateLabel.textContent, 'Update Thu, Oct 8');
assert.equal(vm.runInContext('editorDateKey', context), '2026-10-08');
console.log('Actual calendar editor heading and retained date key: PASS');
