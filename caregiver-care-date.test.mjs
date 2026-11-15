import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CareDateChoice, localCareDay, sleepNightLabel, sleepOnsetAnswer, restoredSleepResponse } from './caregiver-care-date.js';
import { normalizeSleepPayload } from './caregiver-sleep.js';
import { CheckinSubmissionUI } from './caregiver-submission-ui.js';
import { normalizeCaregiverCheckinForCalendar } from './caregiver-report-shared.js';

assert.equal(localCareDay(new Date(2026, 10, 18, 0, 10), -1), '2026-11-17');
assert.equal(localCareDay(new Date(2026, 0, 1), -1), '2025-12-31');
assert.equal(localCareDay(new Date(2026, 2, 9), -1), '2026-03-08');
assert.match(sleepNightLabel('2026-11-14'), /Saturday, November 14 night into Sunday, November 15 morning/);
assert.match(sleepNightLabel('2026-12-31'), /December 31 night into Friday, January 1 morning/);
assert.equal(sleepOnsetAnswer('yes'), true);
assert.equal(sleepOnsetAnswer('no'), false);
assert.equal(sleepOnsetAnswer('not_sure'), null);
assert.equal(sleepOnsetAnswer(''), null);
assert.equal(restoredSleepResponse({ sleep_onset_difficulty: false }), '');
assert.equal(restoredSleepResponse({ sleep_onset_difficulty: false, sleep_onset_response: 'no' }), 'no');
assert.equal(restoredSleepResponse({ sleep_onset_difficulty: true }), 'yes');
assert.equal(restoredSleepResponse({ sleep_onset_difficulty: null }), '');
assert.equal(restoredSleepResponse({ sleep_onset_difficulty: null, sleep_onset_response: 'not_sure' }), 'not_sure');

// Exercise the real controller and submit gate with a minimal DOM and no network.
class Element {
  constructor() { this.value = ''; this.checked = false; this.hidden = false; this.listeners = {}; this.disabled = false; this.textContent = ''; this.dataset = {}; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn(event); }
  focus() {} scrollIntoView() {}
  querySelectorAll() { return []; }
}
const elements = new Map();
const el = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
const classes = new Set();
const doc = {
  getElementById: el,
  body: { classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); } } },
  querySelector: selector => el(selector),
  querySelectorAll: () => [el('sleepNight')],
};
const win = { Event: class { constructor(type) { this.type = type; } }, addEventListener() {} };
const ui = Object.create(CheckinSubmissionUI.prototype);
Object.assign(ui, { doc, win, service: { attempt: null }, context: { userId: 'caregiver', groupId: 'family', practice: false }, duplicateIds: [], busy: false, done: false,
  el: Object.fromEntries(['entryDateInput', 'checkinDateConfirmed', 'checkinDateLabel', 'submitAll', 'allowDuplicate', 'duplicateNotice', 'submissionStatus'].map(id => [id, el(id)])) });
ui.status = () => {};
ui.setLocked = () => {};
ui.careDate = new CareDateChoice({ doc, win, input: el('entryDateInput'), onChangeDate: () => ui.dateChanged() });
el('entryDateInput').addEventListener('input', () => ui.dateChanged());
ui.update();
assert.equal(classes.has('care-date-pending'), true);
assert.equal(el('submitAll').disabled, true);
assert.equal(el('entryDateInput').value, '');
ui.careDate.choose('2026-11-10');
assert.equal(el('entryDateInput').value, '2026-11-10');
assert.equal(classes.has('care-date-pending'), false);
assert.match(el('careDateBannerLabel').textContent, /Tuesday, November 10/);
assert.equal(el('submitAll').textContent, 'Save Tuesday’s check-in');
assert.equal(el('checkinDateConfirmed').checked, false);
assert.equal(el('submitAll').disabled, true);
el('checkinDateConfirmed').checked = true; ui.update();
assert.equal(el('submitAll').disabled, false);
ui.careDate.open();
assert.equal(el('checkinDateConfirmed').checked, false);
assert.equal(ui.begin(), '', 'changing date blocks submission until an explicit new choice');
ui.careDate.choose('2026-11-14');
assert.match(el('sleepNight').textContent, /Saturday, November 14 night into Sunday, November 15 morning/);
assert.equal(el('submitAll').textContent, 'Save Saturday’s check-in');
ui.careDate.requireChoice(); ui.update();
assert.equal(classes.has('care-date-pending'), true, 'recovered drafts require another explicit choice');
assert.equal(el('careDateKeep').hidden, false);
ui.service.attempt = { sent: true }; ui.update();
assert.equal(classes.has('care-date-pending'), false, 'uncertain original attempts remain visible for recovery');
assert.equal(el('careDateChange').disabled, true);
ui.careDate.choose('2026-11-13');
assert.equal(el('entryDateInput').value, '2026-11-14', 'pending save date cannot be changed');
ui.service.attempt = null; ui.careDate.requireChoice(); el('entryDateInput').value = ''; ui.update();
assert.equal(el('careDateKeep').hidden, true, 'new check-in never inherits the previous date');

// Run each project's actual serializer/hydrator, including legacy draft values.
for (const path of ['./caregiver-checkin.html']) {
  const html = await readFile(new URL(path, import.meta.url), 'utf8');
  const start = html.indexOf('    function serialize(step){');
  const end = html.indexOf('    function captureCurrentFormAsDraft(){', start);
  const { serialize, hydrate } = new Function('normalizeSleepPayload', 'sleepOnsetAnswer', 'restoredSleepResponse', 'stepFields', 'syncShiftSupports', html.slice(start, end) + ';return {serialize,hydrate};')(
    normalizeSleepPayload, sleepOnsetAnswer, restoredSleepResponse, step => step.querySelectorAll(), () => {});
  const fields = ['yes', 'no', 'not_sure'].map(value => ({ name: 'sleep_onset_difficulty', type: 'radio', value, checked: false }));
  fields.push({ name: 'sleep_reporting', type: 'radio', value: 'yes', checked: true });
  const step = { id: 'physicalSection', querySelector: () => fields[0], querySelectorAll: () => fields };
  assert.equal(serialize(step).sleep_onset_difficulty, null);
  fields[0].checked = true;
  assert.equal(serialize(step).sleep_onset_difficulty, true);
  fields[0].checked = false; fields[1].checked = true;
  assert.equal(serialize(step).sleep_onset_difficulty, false);
  fields[1].checked = false; fields[2].checked = true;
  assert.equal(serialize(step).sleep_onset_difficulty, null);
  assert.equal(serialize(step).sleep_onset_response, 'not_sure');
  hydrate(step, { sleep_onset_difficulty: false });
  assert.deepEqual(fields.slice(0,3).map(f => f.checked), [false, false, false]);
  hydrate(step, { sleep_onset_difficulty: false, sleep_onset_response: 'no' });
  assert.deepEqual(fields.slice(0,3).map(f => f.checked), [false, true, false]);
  hydrate(step, { sleep_onset_difficulty: true });
  assert.deepEqual(fields.slice(0,3).map(f => f.checked), [true, false, false]);
}
const nextMorning = { date: '2026-11-14', submitted_at: '2026-11-15T14:00:00Z', payload: { entry_date: '2026-11-14', sleep_onset_difficulty: true, sleep_fell_asleep_time: '05:30' } };
assert.equal(normalizeCaregiverCheckinForCalendar(nextMorning).dateKey, '2026-11-14');
console.log('Explicit care-day choice, overnight sleep, boolean compatibility, draft resume, frozen pending saves and calendar placement: PASS');
