import assert from 'node:assert/strict';
import { CheckinSubmissionUI } from './caregiver-submission-ui.js';

// Verify the success display without making a Supabase request.
function setup() {
  const classes = new Set();
  const banner = {
    textContent: '',
    classList: {
      add: key => classes.add(key),
      remove: key => classes.delete(key),
      contains: key => classes.has(key),
    },
  };
  const submissionStatus = { textContent: '', dataset: {}, focus() {} };
  const ui = Object.create(CheckinSubmissionUI.prototype);
  let timerCallback;
  ui.doc = { getElementById: id => id === 'successBanner' ? banner : null };
  ui.win = {
    setTimeout: callback => { timerCallback = callback; return 1; },
    clearTimeout: () => {},
  };
  ui.el = {
    submissionStatus,
    checkinDateConfirmed: { checked: true },
    checkSaveStatus: { hidden: false },
    startNewCheckin: { hidden: true },
    storageNotice: { hidden: true, textContent: '' },
    duplicateNotice: { hidden: true },
    duplicateDateLabel: { textContent: '' },
    allowDuplicate: { checked: false },
  };
  ui.service = { attempt: null };
  ui.setLocked = () => {};
  ui.update = () => {};
  ui.saveRecovery = () => {};
  ui.store = { complete: () => {} };
  return { ui, banner, submissionStatus, getTimer: () => timerCallback };
}

const saved = setup();
saved.ui.finish({ state: 'verified', row: { id: 'internal-record-id', date: '2026-10-27' } });
assert.equal(saved.ui.done, true);
assert.equal(saved.ui.el.checkinDateConfirmed.checked, false);
assert.equal(saved.submissionStatus.dataset.state, 'verified');
assert.match(saved.submissionStatus.textContent, /Check-In Submitted Successfully/);
assert.ok(!saved.submissionStatus.textContent.includes('internal-record-id'), 'do not show technical IDs to caregivers');
assert.equal(saved.banner.classList.contains('is-visible'), true);
saved.getTimer()();
assert.equal(saved.banner.classList.contains('is-visible'), false);

const practice = setup();
practice.ui.finish({ state: 'practice', date: '2026-10-27' });
assert.equal(practice.submissionStatus.dataset.state, 'practice');
assert.match(practice.submissionStatus.textContent, /NOT saved to Supabase/);
assert.equal(practice.banner.classList.contains('is-visible'), false, 'practice is not a verified real save');

const uncertain = setup();
uncertain.ui.service.attempt = { sent: true };
uncertain.ui.finish({ state: 'uncertain', message: 'Connection interrupted' });
assert.equal(uncertain.submissionStatus.dataset.error, 'true');
assert.equal(uncertain.banner.classList.contains('is-visible'), false);
assert.match(uncertain.submissionStatus.textContent, /do not resubmit/i);

saved.ui.showSuccessBanner();
saved.ui.status('New check-in — select the date being documented.');
assert.equal(saved.banner.classList.contains('is-visible'), false, 'old success ribbon must clear for a new check-in');

console.log('Check-in success ribbon, practice isolation, and uncertain-save safeguards: PASS');
