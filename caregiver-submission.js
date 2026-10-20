import { checkinDateKey, normalizeCheckinDate } from './caregiver-dates.js';

export function validSelectedDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && normalizeCheckinDate(value) === value;
}

export function verifySavedCheckin(saved, expected) {
  return !!saved && saved.id === expected.id && saved.user_id === expected.user_id &&
    saved.group_id === expected.group_id && saved.date === expected.date &&
    saved.payload?.entry_date === expected.payload?.entry_date;
}

// Each open form has its own recovery slot. No global draft key and no upserts.
export class CheckinRecoveryStore {
  constructor(storage, { userId, groupId, practice = false }, slotId) {
    if (!userId || !groupId) throw new Error('Sign in and select a group before saving recovery information.');
    this.storage = storage;
    this.prefix = `star-checkin-recovery-v2:${practice ? 'practice' : 'real'}:${userId}:${groupId}:`;
    this.key = this.prefix + slotId;
  }
  save(value) {
    const text = JSON.stringify({ ...value, updatedAt: new Date().toISOString() });
    this.storage.setItem(this.key, text);
    if (this.storage.getItem(this.key) !== text) throw new Error('Browser recovery storage could not be verified.');
    return JSON.parse(text);
  }
  list() {
    const result = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(this.prefix)) continue;
      const value = JSON.parse(this.storage.getItem(key));
      if (value && value.phase !== 'verified') result.push({ key, ...value });
    }
    return result.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  // A verified receipt is persisted before removal; failed removal cannot revive a pending save.
  complete(value) {
    this.save({ ...value, phase: 'verified' });
    this.storage.removeItem(this.key);
    if (value.recordId) {
      // A resumed attempt can have copies in multiple recovery slots. Retire only
      // copies of this exact verified attempt; never clear another form's work.
      for (const item of this.list()) {
        if (item.attempt?.row?.id !== value.recordId) continue;
        const receipt = JSON.stringify({ ...value, phase: 'verified', updatedAt: new Date().toISOString() });
        this.storage.setItem(item.key, receipt);
        if (this.storage.getItem(item.key) !== receipt) throw new Error('Recovery cleanup could not be verified.');
        this.storage.removeItem(item.key);
      }
    }
  }
  remove() { this.storage.removeItem(this.key); }
}

export class CaregiverSubmission {
  constructor({ request, assertContext, persistAttempt, newId = () => crypto.randomUUID(), timeoutMs = 20000 }) {
    Object.assign(this, { request, assertContext, persistAttempt, newId, timeoutMs });
    this.attempt = null;
    this.busy = false;
  }
  async call(path, options = {}) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        this.request(path, { ...options, signal: controller.signal }),
        new Promise((_, reject) => { timer = setTimeout(() => {
          controller.abort();
          reject(new Error('The request timed out.'));
        }, this.timeoutMs); })
      ]);
    } finally { clearTimeout(timer); }
  }
  async readAttempt() {
    const row = this.attempt.row;
    const rows = await this.call(`caregiver_checkins?select=id,user_id,group_id,date,payload&id=eq.${encodeURIComponent(row.id)}&user_id=eq.${encodeURIComponent(row.user_id)}&group_id=eq.${encodeURIComponent(row.group_id)}&limit=2`, { expectedUserId: row.user_id });
    if (!Array.isArray(rows) || rows.length !== 1 || !verifySavedCheckin(rows[0], row)) {
      return { state: 'uncertain', message: 'The saved record could not be verified. Do not submit another copy. Check save status again or contact support.', id: row.id };
    }
    return { state: 'verified', row: rows[0] };
  }
  async reconcile() {
    if (this.busy) return { state: 'saving' };
    if (!this.attempt) return { state: 'failed', message: 'No pending submission to check.' };
    this.busy = true;
    try {
      await this.assertContext(this.attempt.row);
      return await this.readAttempt();
    } catch {
      return { state: 'uncertain', message: 'STAR cannot confirm this save yet. Your recovery copy is retained. Reconnect or sign in to the original account, then check save status.', id: this.attempt.row.id };
    } finally { this.busy = false; }
  }
  async submit(row, { confirmed = false, approvedDuplicateIds = [] } = {}) {
    if (this.busy) return { state: 'saving' };
    // Once POST may have been sent, this object can ONLY read that attempt, never POST again.
    if (this.attempt?.sent) return this.reconcile();
    if (!confirmed || !validSelectedDate(row.date) || row.payload?.entry_date !== row.date) {
      return { state: 'failed', message: 'Select and confirm the exact check-in date before submitting.' };
    }
    this.busy = true;
    try {
      await this.assertContext(row);
      const existing = [];
      for (let offset = 0; ; offset += 1000) {
        const rows = await this.call(`caregiver_checkins?select=id,date,payload&user_id=eq.${encodeURIComponent(row.user_id)}&group_id=eq.${encodeURIComponent(row.group_id)}&order=id.asc&limit=1000&offset=${offset}`, { expectedUserId: row.user_id });
        if (!Array.isArray(rows)) throw new Error('Existing check-ins could not be checked.');
        existing.push(...rows.filter(record => checkinDateKey(record) === row.date));
        if (rows.length < 1000) break;
      }
      if (existing.some(record => !approvedDuplicateIds.includes(record.id))) {
        return { state: 'duplicate', date: row.date, ids: existing.map(record => record.id) };
      }
      await this.assertContext(row);
      const savedRow = JSON.parse(JSON.stringify({ ...row, id: this.newId() }));
      this.attempt = { row: savedRow, sent: true };
      // Must succeed before POST. A reload will reconcile this same ID, even if the response is lost.
      try { await this.persistAttempt(this.attempt); }
      catch {
        this.attempt = null;
        return { state: 'failed', message: 'Browser recovery storage is unavailable. Nothing was sent. Your answers remain on this page; download a recovery copy before leaving and enable browser storage before retrying.' };
      }
      let response;
      try {
        response = await this.call('caregiver_checkins', {
          method: 'POST', expectedUserId: row.user_id,
          headers: { Prefer: 'return=representation' }, body: JSON.stringify([savedRow])
        });
      } catch (error) {
        // Even an error response can be ambiguous (proxy, timeout, lost auth response).
        // Never automatically repeat a POST; always query the attempt's ID first.
        const result = await this.readAttempt().catch(() => null);
        if (result?.state === 'verified') return result;
        return { state: 'uncertain', id: savedRow.id, message: 'The submission was interrupted or rejected. STAR could not verify a saved record. Do not resubmit; check save status or contact support with the attempt ID.' };
      }
      const returned = Array.isArray(response) ? response[0] : response;
      if (!verifySavedCheckin(returned, savedRow)) {
        return { state: 'uncertain', id: savedRow.id, message: 'Supabase returned an unexpected record or date. Do not resubmit; check save status or contact support.' };
      }
      return await this.readAttempt();
    } catch (error) {
      return { state: this.attempt?.sent ? 'uncertain' : 'failed', id: this.attempt?.row?.id,
        message: this.attempt?.sent ? 'Save verification was interrupted. Do not resubmit; check save status.' : (error?.message || 'Saving failed before a record was sent.') };
    } finally { this.busy = false; }
  }
}
