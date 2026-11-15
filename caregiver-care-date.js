import { formatCheckinDate, normalizeCheckinDate } from './caregiver-dates.js';

export function localCareDay(now = new Date(), offset = 0) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export const careDateLabel = date => formatCheckinDate(date, undefined,
  { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export function sleepNightLabel(date) {
  if (!normalizeCheckinDate(date)) return 'Choose the care date first.';
  const morning = new Date(`${date}T12:00:00Z`);
  morning.setUTCDate(morning.getUTCDate() + 1);
  const morningKey = morning.toISOString().slice(0, 10);
  return `${formatCheckinDate(date, undefined, { weekday: 'long', month: 'long', day: 'numeric' })} night into ${formatCheckinDate(morningKey, undefined, { weekday: 'long', month: 'long', day: 'numeric' })} morning`;
}
export function sleepOnsetAnswer(value) {
  if (value === true || value === 'yes' || value === 'true') return true;
  if (value === false || value === 'no' || value === 'false') return false;
  return null;
}
export function restoredSleepResponse(data = {}) {
  if (data.sleep_onset_response === 'not_sure') return 'not_sure';
  const value = sleepOnsetAnswer(data.sleep_onset_difficulty);
  return value === true ? 'yes' : value === false && data.sleep_onset_response === 'no' ? 'no' : '';
}

// This controller never writes records. The existing verified submission path
// continues to save row.date and payload.entry_date as the explicitly chosen day.
export class CareDateChoice {
  constructor({ doc, win, input, onChangeDate }) {
    Object.assign(this, { doc, win, input, onChangeDate });
    this.chosenDate = '';
    this.choosing = true;
    this.chooser = doc.getElementById('careDateChooser');
    this.custom = doc.getElementById('careDateCustom');
    this.picker = doc.getElementById('careDatePicker');
    this.error = doc.getElementById('careDateError');
    this.refreshRelativeDates();
    doc.getElementById('careDateToday').addEventListener('click', () => this.choose(localCareDay()));
    doc.getElementById('careDateYesterday').addEventListener('click', () => this.choose(localCareDay(new Date(), -1)));
    doc.getElementById('careDateOther').addEventListener('click', () => {
      this.custom.hidden = false;
      this.picker.max = localCareDay();
      this.picker.focus();
    });
    doc.getElementById('careDateUse').addEventListener('click', () => this.choose(this.picker.value));
    doc.getElementById('careDateKeep').addEventListener('click', () => this.choose(this.input.value));
    doc.getElementById('careDateChange').addEventListener('click', () => this.open());
    win.addEventListener('pageshow', () => this.refreshRelativeDates());
    doc.querySelectorAll('input[name="sleep_reporting"]').forEach(el => el.addEventListener('change', () => this.sync(this.locked)));
  }
  refreshRelativeDates() {
    this.doc.getElementById('careDateTodayLabel').textContent = careDateLabel(localCareDay());
    this.doc.getElementById('careDateYesterdayLabel').textContent = careDateLabel(localCareDay(new Date(), -1));
    this.picker.max = localCareDay();
  }
  get ready() { return !this.choosing && this.chosenDate === this.input.value && !!normalizeCheckinDate(this.input.value); }
  requireChoice() { this.chosenDate = ''; this.choosing = true; }
  open() {
    this.choosing = true;
    this.refreshRelativeDates();
    this.onChangeDate();
    this.chooser.scrollIntoView({ block: 'start', behavior: 'smooth' });
    this.doc.getElementById('careDateToday').focus({ preventScroll: true });
  }
  choose(date) {
    if (this.locked) return;
    if (!normalizeCheckinDate(date) || date > localCareDay()) {
      this.error.textContent = 'Choose the day care happened, today or an earlier date.';
      return;
    }
    this.error.textContent = '';
    this.input.value = date;
    this.chosenDate = date;
    this.choosing = false;
    // Preserve existing explicit-date tracking, date confirmation invalidation,
    // and draft capture in both projects.
    this.input.dispatchEvent(new this.win.Event('input', { bubbles: true }));
    this.input.dispatchEvent(new this.win.Event('change', { bubbles: true }));
    this.sync(this.locked);
    this.doc.getElementById('careDateBanner').focus({ preventScroll: true });
  }
  sync(locked = false) {
    this.locked = locked;
    const ready = this.ready;
    this.doc.body.classList.toggle('care-date-pending', !ready);
    this.chooser.hidden = ready;
    this.doc.getElementById('careDateBanner').hidden = !ready;
    const keep = this.doc.getElementById('careDateKeep');
    keep.hidden = !normalizeCheckinDate(this.input.value);
    keep.textContent = `Keep care date: ${careDateLabel(this.input.value)}`;
    this.chooser.querySelectorAll('button,input').forEach(el => { el.disabled = locked; });
    this.doc.getElementById('careDateChange').disabled = locked;
    this.doc.getElementById('careDateBannerLabel').textContent = careDateLabel(this.input.value);
    this.doc.getElementById('checkinDateTitle').textContent = ready
      ? `Ready to save ${formatCheckinDate(this.input.value, undefined, { weekday: 'long' })}’s check-in?`
      : 'Confirm care date';
    this.doc.getElementById('checkinDateConfirmationText').textContent = ready
      ? `I am reporting care for ${careDateLabel(this.input.value)}.` : 'I confirm the care date is correct.';
    this.doc.querySelectorAll('[data-sleep-night]').forEach(el => { el.textContent = sleepNightLabel(this.input.value); });
    const sleepScope = this.doc.querySelector('input[name="sleep_reporting"]:checked')?.value;
    this.doc.querySelectorAll('[data-sleep-review]').forEach(el => { el.hidden = sleepScope !== 'yes'; });
    const sleepQuestions = this.doc.getElementById('sleepQuestions');
    if (sleepQuestions) {
      sleepQuestions.hidden = sleepScope !== 'yes';
      sleepQuestions.disabled = sleepScope !== 'yes';
    }
    const progress = this.doc.querySelector('.progress');
    if (progress) progress.inert = locked || !ready;
    const save = this.doc.getElementById('saveDraftAlways');
    if (save) save.disabled = locked || !ready;
  }
}
