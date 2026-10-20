import { formatCheckinDate } from './caregiver-dates.js';
import { CaregiverSubmission, CheckinRecoveryStore, validSelectedDate } from './caregiver-submission.js';
import { CaregiverDraftService } from './caregiver-draft-service.js?v=2026.10.20D';

const fullDate = value => formatCheckinDate(value, undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

export class CheckinSubmissionUI {
  constructor({ document: doc, window: win, context, request, currentContext, capture, restore, reset, changeDate }) {
    Object.assign(this, { doc, win, context: Object.freeze({ ...context }), currentContext, capture, restore, reset, changeDate });
    this.el = Object.fromEntries(['entryDateInput', 'checkinDateConfirmed', 'checkinDateLabel', 'submitAll', 'checkinFields',
      'submissionStatus', 'storageNotice', 'recoveryChoices', 'resumeDraftBtn', 'discardDraftBtn', 'checkSaveStatus',
      'startNewCheckin', 'duplicateNotice', 'duplicateDateLabel', 'allowDuplicate', 'changeCheckinDate',
      'downloadRecovery', 'submissionContext'].map(id => [id, doc.getElementById(id)]));
    this.dirty = false;
    this.busy = false;
    this.done = false;
    this.cloudSaving = false;
    this.cloudDraftId = null;
    this.cloudDraftVersion = null;
    // Cloud draft setup is optional: a configuration error must never prevent
    // caregivers from opening the form or submitting their check-ins.
    this.cloudDraftService = null;
    if (!context.practice && context.userId && context.groupId) {
      try {
        this.cloudDraftService = new CaregiverDraftService({
          request, userId: context.userId, groupId: context.groupId,
        });
      } catch (error) {
        console.warn('[STAR] Cloud draft setup unavailable; check-in remains usable.', error);
      }
    }
    this.duplicateIds = [];
    this.store = null;
    this.setStore();
    this.service = new CaregiverSubmission({ request,
      assertContext: row => this.assertContext(row), persistAttempt: () => this.saveRecovery(true) });
    this.el.entryDateInput.value = '';
    this.el.checkinDateConfirmed.checked = false;
    this.el.submissionContext.textContent = `${context.practice ? 'PRACTICE — not saved to Supabase. ' : ''}Caregiver: ${context.caregiverLabel} · Group: ${context.groupLabel}`;
    this.el.submitAll.textContent = context.practice ? 'Complete Practice — Not Saved' : 'Submit Check-In';
    this.el.entryDateInput.addEventListener('input', () => this.dateChanged());
    this.el.entryDateInput.addEventListener('change', () => this.dateChanged());
    this.el.checkinDateConfirmed.addEventListener('change', () => this.update());
    this.el.allowDuplicate.addEventListener('change', () => this.update());
    this.el.changeCheckinDate.addEventListener('click', () => this.changeDate());
    this.el.resumeDraftBtn.addEventListener('click', () => this.resume());
    this.el.discardDraftBtn.addEventListener('click', () => this.discard());
    this.el.startNewCheckin.addEventListener('click', () => this.startNew());
    this.el.checkSaveStatus.addEventListener('click', () => this.checkStatus());
    this.el.downloadRecovery.addEventListener('click', () => this.download());
    const form = doc.getElementById('cg-form');
    for (const event of ['input', 'change']) form.addEventListener(event, e => {
      if (e.target.closest?.('#checkinFields')) this.changed();
    });
    // Save after click-driven question controls have updated their hidden fields.
    form.addEventListener('click', e => {
      if (e.target.closest?.('#checkinFields')) queueMicrotask(() => this.changed());
    });
    win.addEventListener('beforeunload', e => {
      if (this.done || (!this.dirty && !this.service.attempt?.sent)) return;
      if (!this.done) this.saveRecovery();
      e.preventDefault();
      e.returnValue = '';
    });
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden' && this.dirty && !this.done) this.saveRecovery();
    });
    win.addEventListener('pageshow', () => this.dateChanged());
    win.addEventListener('pagehide', () => { if (this.dirty && !this.done) this.saveRecovery(); });
    doc.addEventListener('click', e => {
      const link = e.target.closest?.('a[href]');
      if (!link || link.target === '_blank' || link.getAttribute('href')?.startsWith('#')) return;
      if ((this.dirty || this.service.attempt?.sent) && !this.done) {
        this.saveRecovery();
        if (!win.confirm('This check-in is not yet saved and verified. Leave this page? A recovery copy is available only if browser storage succeeded.')) e.preventDefault();
      }
    }, true);
    this.setLocked(false);
    this.refreshRecoveryList();
    // A Home dashboard draft link opens its exact recovery slot after account/group
    // context is established. Never auto-resume a draft without an explicit link.
    const requestedDraft = new URLSearchParams(win.location.search).get('resumeDraft');
    if (requestedDraft) {
      const match = this.recoveries?.find(item => item.key === requestedDraft);
      if (match && match.context?.userId === context.userId &&
          match.context?.groupId === context.groupId && match.context?.practice === context.practice) {
        this.el.recoveryChoices.value = requestedDraft;
        this.resume();
      } else {
        this.status('This saved draft is not available in this browser, caregiver account, or group.', true);
      }
      const cleaned = new URL(win.location.href);
      cleaned.searchParams.delete('resumeDraft');
      win.history.replaceState(null, '', cleaned.pathname + cleaned.search + cleaned.hash);
    }
    if (!context.userId || !context.groupId) this.status('Save Failed — sign in and open this form in the correct group before entering a check-in.', true);
    else if (!requestedDraft) this.status(context.practice ? 'Practice Mode — completion does not save a real check-in.' : 'Choose the date being documented, then confirm it below.');
    this.update();
  }
  setStore() {
    this.store = null;
    try {
      this.store = new CheckinRecoveryStore(this.win.localStorage, this.context, this.win.crypto.randomUUID());
    } catch { this.storageWarning(); }
  }
  assertContext(row) {
    const current = this.currentContext();
    if (!this.context.userId || !this.context.groupId || current.userId !== this.context.userId ||
        current.groupId !== this.context.groupId || row.user_id !== this.context.userId || row.group_id !== this.context.groupId) {
      throw new Error('The caregiver or group has changed. Information is preserved; return to the original account and group before saving.');
    }
  }
  dateChanged() {
    this.el.checkinDateConfirmed.checked = false;
    this.el.allowDuplicate.checked = false;
    this.duplicateIds = [];
    this.el.duplicateNotice.hidden = true;
    this.update();
  }
  update() {
    const date = this.el.entryDateInput.value;
    const valid = validSelectedDate(date);
    this.el.checkinDateLabel.textContent = valid ? fullDate(date) : 'Select the date being documented.';
    this.el.checkinDateConfirmed.disabled = !valid || this.busy || this.done || !!this.service?.attempt?.sent;
    this.el.submitAll.disabled = !valid || !this.el.checkinDateConfirmed.checked || this.busy || this.done ||
      !!this.service?.attempt?.sent || !this.context.userId || !this.context.groupId ||
      (this.duplicateIds.length > 0 && !this.el.allowDuplicate.checked);
  }
  setLocked(locked) {
    this.el.checkinFields.disabled = locked;
    this.el.checkinFields.inert = locked;
    for (const id of ['changeCheckinDate', 'resumeDraftBtn', 'discardDraftBtn', 'recoveryChoices', 'allowDuplicate']) this.el[id].disabled = locked;
    const progress = this.doc.querySelector('.progress');
    if (progress) progress.inert = locked;
    const toggle = this.doc.getElementById('toggleAll');
    if (toggle) toggle.disabled = locked;
    this.update();
  }
  status(message, error = false) {
    this.el.submissionStatus.textContent = message;
    this.el.submissionStatus.dataset.error = String(error);
  }
  storageWarning() {
    this.el.storageNotice.hidden = false;
    this.el.storageNotice.textContent = 'Browser recovery storage is unavailable or unreadable. Answers remain only on this page. Download a recovery copy before leaving. Saving a real check-in is blocked until its recovery copy can be stored.';
  }
  snapshot() {
    return { context: this.context, draft: this.capture(), attempt: this.service?.attempt || null, phase: this.service?.attempt?.sent ? 'pending' : 'draft' };
  }
  saveRecovery(required = false) {
    try {
      if (!this.store) throw new Error('No recovery storage');
      this.store.save(this.snapshot());
      this.el.storageNotice.hidden = false;
      this.el.storageNotice.textContent = 'Recovery copy saved on this browser. Clearing browser data, private browsing, or device loss can remove it. Save Draft also keeps a local copy; it does not submit a check-in.';
      return true;
    } catch {
      this.storageWarning();
      if (required) throw new Error('Recovery storage unavailable');
      return false;
    }
  }
  changed() {
    if (this.busy || this.done || this.service.attempt?.sent) return;
    this.dirty = true;
    this.saveRecovery();
  }
  async saveDraft() {
    if (this.busy || this.done || this.service.attempt?.sent || this.cloudSaving) return false;
    this.dirty = true;
    const localSaved = this.saveRecovery();
    if (this.context.practice) {
      this.status(localSaved ? 'Practice draft saved on this browser only.' : 'Practice draft could not be saved.', !localSaved);
      if (localSaved) this.refreshRecoveryList();
      return localSaved;
    }
    if (!localSaved || !this.cloudDraftService) {
      this.status('Draft not saved to Supabase. Keep this page open or download a recovery copy.', true);
      return false;
    }
    this.cloudSaving = true;
    this.status('Saving draft securely to Supabase…');
    try {
      await this.assertContext({ user_id: this.context.userId, group_id: this.context.groupId });
      const draft = this.capture();
      const rawDate = draft?.data?.[0]?.entry_date || this.el.entryDateInput.value;
      const date = validSelectedDate(rawDate) ? rawDate : null;
      // Use one stable ID per browser recovery slot. An interrupted create can be
      // reconciled by this ID without creating a second server draft.
      const id = this.cloudDraftId || this.store.key.split(':').at(-1);
      let existing = null;
      try { existing = await this.cloudDraftService.get(id); }
      catch (error) {
        if (!String(error.message).includes('not found or access denied')) throw error;
      }
      let saved;
      if (existing) {
        // A stale browser copy must not overwrite changes saved from another device.
        if (this.cloudDraftVersion !== null && existing.version !== this.cloudDraftVersion) {
          throw new Error('This draft changed on another device. Nothing was overwritten. Keep your browser recovery copy and review the newer draft.');
        }
        if (this.cloudDraftVersion === null) {
          throw new Error('A Supabase draft already exists for this browser slot. Nothing was overwritten. Open the saved draft from My Saved Drafts.');
        }
        saved = await this.cloudDraftService.update({ id, version: existing.version, date, data: draft });
      } else {
        saved = await this.cloudDraftService.create({ id, date, data: draft, caregiverName: this.context.caregiverLabel });
      }
      this.cloudDraftId = id;
      this.cloudDraftVersion = saved.version;
      this.status('Draft Saved and Verified in Supabase — not submitted as a check-in.');
      this.el.storageNotice.hidden = false;
      this.el.storageNotice.textContent = 'Supabase draft verified. A separate browser recovery copy is also kept on this device.';
      this.refreshRecoveryList();
      return true;
    } catch (error) {
      this.status('Supabase draft NOT confirmed: ' + (error?.message || 'Connection error') + ' Your browser recovery copy is retained. Do not clear browser data.', true);
      this.refreshRecoveryList();
      return false;
    } finally {
      this.cloudSaving = false;
    }
  }
  refreshRecoveryList() {
    try {
      this.recoveries = this.store?.list() || [];
      const select = this.el.recoveryChoices;
      select.replaceChildren();
      for (const item of this.recoveries) {
        const option = this.doc.createElement('option');
        option.value = item.key;
        const date = item.draft?.data?.[0]?.entry_date;
        option.textContent = `${validSelectedDate(date) ? fullDate(date) : 'No date selected'} · ${new Date(item.updatedAt).toLocaleString()}${item.attempt?.sent ? ' · SAVE STATUS UNCERTAIN' : ''}`;
        select.appendChild(option);
      }
      this.el.resumeDraftBtn.hidden = !this.recoveries.length;
      select.hidden = !this.recoveries.length;
      this.el.resumeDraftBtn.disabled = this.busy || this.done || !!this.service.attempt?.sent;
    } catch { this.storageWarning(); }
  }
  resume() {
    if (this.busy || this.done || this.service.attempt?.sent) return;
    const item = this.recoveries?.find(record => record.key === this.el.recoveryChoices.value);
    if (!item || item.context?.userId !== this.context.userId || item.context?.groupId !== this.context.groupId || item.context?.practice !== this.context.practice) return;
    if (this.dirty && !this.win.confirm('Replace the current answers with this recovery copy? The current answers will be kept in a separate recovery slot.')) return;
    if (this.dirty && !this.saveRecovery()) return;
    // Fork rather than overwrite a draft that may be open in another tab.
    this.setStore();
    this.reset();
    this.restore(item.draft);
    this.service.attempt = item.attempt || null;
    this.dateChanged();
    this.dirty = true;
    this.saveRecovery();
    this.setLocked(!!this.service.attempt?.sent);
    this.el.checkSaveStatus.hidden = !this.service.attempt?.sent;
    const date = this.el.entryDateInput.value;
    this.status(this.service.attempt?.sent
      ? 'Save Status Uncertain — recovered a pending submission. Do not resubmit; check its save status.'
      : `Draft restored${validSelectedDate(date) ? ` for ${fullDate(date)}` : ''}. Review the answers and confirm the date again.`);
  }
  discard() {
    if (this.busy || this.done || this.service.attempt?.sent || !this.win.confirm('Discard the answers in this open form? Other recovery copies will remain.')) return;
    try { this.store?.remove(); }
    catch { this.storageWarning(); return; }
    this.reset();
    this.dirty = false;
    this.dateChanged();
    this.status('Open form discarded. Select a date to start a new check-in.');
    this.refreshRecoveryList();
  }
  begin() {
    if (this.busy || this.done || this.service.attempt?.sent) return '';
    const date = this.el.entryDateInput.value;
    if (!validSelectedDate(date) || !this.el.checkinDateConfirmed.checked) {
      this.status('Save Failed — select a valid check-in date and confirm it directly above Submit. Your answers remain on this page.', true);
      this.el.submissionStatus.focus();
      return '';
    }
    if (this.duplicateIds.length && !this.el.allowDuplicate.checked) return '';
    this.dirty = true;
    this.busy = true;
    this.setLocked(true);
    this.status('Saving — please wait.');
    return date;
  }
  async submit(row) {
    if (this.context.practice) return { state: 'practice', date: row.date };
    const submit = () => {
      // Refreshing or opening another tab must not evade an unresolved attempt.
      try {
        const pending = this.store?.list().find(item => item.attempt?.sent && item.attempt.row?.date === row.date);
        if (pending && pending.attempt.row.id !== this.service.attempt?.row?.id) {
          this.refreshRecoveryList();
          this.el.recoveryChoices.value = pending.key;
          return { state: 'failed', message: 'An unresolved submission already exists for this date. No new record was sent. Resume the selected pending recovery copy and check its save status before creating another entry.' };
        }
      } catch {
        this.storageWarning();
        return { state: 'failed', message: 'Recovery copies could not be checked for pending saves. Nothing was sent. Download a recovery copy before leaving.' };
      }
      return this.service.submit(row, { confirmed: this.el.checkinDateConfirmed.checked,
        approvedDuplicateIds: this.el.allowDuplicate.checked ? this.duplicateIds : [] });
    };
    if (this.win.navigator?.locks) {
      return this.win.navigator.locks.request(`star-checkin:${row.user_id}:${row.group_id}:${row.date}`, submit);
    }
    return submit();
  }
  async checkStatus() {
    if (this.busy || !this.service.attempt) return;
    this.busy = true;
    this.el.checkSaveStatus.disabled = true;
    this.status('Checking the original submission — no new record will be created.');
    try { this.finish(await this.service.reconcile()); }
    finally { this.el.checkSaveStatus.disabled = false; }
  }
  finish(result) {
    this.busy = false;
    if (result.state === 'verified' || result.state === 'practice') {
      const date = result.row?.date || result.date;
      this.done = true;
      this.dirty = false;
      this.el.checkinDateConfirmed.checked = false;
      this.el.checkSaveStatus.hidden = true;
      this.el.startNewCheckin.hidden = false;
      this.setLocked(true);
      this.status(result.state === 'practice'
        ? `Practice complete for ${fullDate(date)} — NOT saved to Supabase. This is not a real check-in.`
        : `Saved and Verified — ${fullDate(date)}. Record ID: ${result.row.id}.`);
      // Database success is never downgraded by local cleanup failure.
      try { this.store?.complete({ context: this.context, recordId: result.row?.id, date }); }
      catch {
        this.el.storageNotice.hidden = false;
        this.el.storageNotice.textContent = 'The completion above is confirmed, but browser recovery cleanup failed. A recovered pending copy must check its original save status; do not submit it again.';
      }
    } else if (result.state === 'duplicate') {
      this.duplicateIds = result.ids;
      this.el.duplicateNotice.hidden = false;
      this.el.duplicateDateLabel.textContent = `An existing check-in from this caregiver and group is dated ${fullDate(result.date)} (${result.ids.length} found).`;
      this.el.allowDuplicate.checked = false;
      this.status('Existing check-in found. Explicitly confirm below only if you intend to create an additional check-in.');
      this.setLocked(false);
      this.el.duplicateNotice.scrollIntoView({ block: 'center' });
    } else {
      const uncertain = result.state === 'uncertain' || !!this.service.attempt?.sent;
      this.status(`${uncertain ? 'Save Status Uncertain — do not resubmit.' : 'Save Failed — information preserved on this page.'} ${result.message || ''}${result.id ? ` Attempt ID: ${result.id}.` : ''}`, true);
      this.el.checkSaveStatus.hidden = !uncertain;
      this.setLocked(uncertain);
      this.saveRecovery();
    }
    this.update();
    this.el.submissionStatus.focus();
  }
  startNew() {
    if (!this.done || this.busy) return;
    this.service.attempt = null;
    this.done = false;
    this.dirty = false;
    this.setStore();
    this.reset();
    this.dateChanged();
    this.setLocked(false);
    this.el.startNewCheckin.hidden = true;
    this.status('New check-in — select the date being documented.');
    this.refreshRecoveryList();
  }
  download() {
    const blob = new Blob([JSON.stringify(this.snapshot(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = this.doc.createElement('a');
    link.href = url;
    link.download = 'STAR-checkin-recovery.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}