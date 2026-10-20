// Durable draft service: inactive until a reviewed Supabase migration and UI wiring.
// All methods use the caller's authenticated REST adapter; database RLS must enforce ownership.
import { normalizeCheckinDate } from './caregiver-dates.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const encode = encodeURIComponent;

export class CaregiverDraftService {
  constructor({ request, userId, groupId }) {
    if (typeof request !== 'function' || !uuid(userId) || !uuid(groupId)) {
      throw new Error('A signed-in caregiver and valid group are required.');
    }
    Object.assign(this, { request, userId, groupId });
  }
  path(query) { return 'caregiver_checkin_drafts?' + query; }
  async list() {
    const result = await this.request(this.path('select=id,author_user_id,group_id,checkin_date,updated_at,version,author_display_name_snapshot&author_user_id=eq.' +
      encode(this.userId) + '&group_id=eq.' + encode(this.groupId) + '&order=updated_at.desc'));
    if (!Array.isArray(result)) throw new Error('Draft list could not be verified.');
    return result.filter(row => row.author_user_id === this.userId && row.group_id === this.groupId);
  }
  async get(id) {
    if (!uuid(id)) throw new Error('Invalid draft identifier.');
    const result = await this.request(this.path('select=*&id=eq.' + encode(id) +
      '&author_user_id=eq.' + encode(this.userId) + '&group_id=eq.' + encode(this.groupId) + '&limit=2'));
    if (!Array.isArray(result) || result.length !== 1 ||
      result[0].author_user_id !== this.userId || result[0].group_id !== this.groupId) {
      throw new Error('Draft not found or access denied.');
    }
    return result[0];
  }
  async create({ id, date = null, data, caregiverName = '' }) {
    if (!uuid(id)) throw new Error('Invalid draft identifier.');
    const selectedDate = date === null || date === '' ? null : normalizeCheckinDate(date);
    if (date && !selectedDate) throw new Error('Invalid check-in date.');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid draft data.');
    const row = { id, author_user_id: this.userId, group_id: this.groupId,
      checkin_date: selectedDate, draft_data: data, author_display_name_snapshot: caregiverName };
    const result = await this.request('caregiver_checkin_drafts', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify([row]),
    });
    const saved = Array.isArray(result) ? result[0] : result;
    if (!saved || saved.id !== id || saved.author_user_id !== this.userId ||
      saved.group_id !== this.groupId || saved.checkin_date !== selectedDate) {
      throw new Error('Draft save is uncertain. Check the original draft ID before retrying.');
    }
    return this.get(id);
  }
  async update({ id, version, date = null, data }) {
    if (!uuid(id) || !Number.isSafeInteger(version) || version < 1) throw new Error('Invalid draft or version.');
    const selectedDate = date === null || date === '' ? null : normalizeCheckinDate(date);
    if (date && !selectedDate) throw new Error('Invalid check-in date.');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid draft data.');
    const result = await this.request(this.path('id=eq.' + encode(id) + '&author_user_id=eq.' +
      encode(this.userId) + '&group_id=eq.' + encode(this.groupId) + '&version=eq.' + version), {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ checkin_date: selectedDate, draft_data: data, version: version + 1 }),
    });
    if (!Array.isArray(result) || result.length !== 1 || result[0].id !== id ||
      result[0].version !== version + 1) {
      throw new Error('Draft update was not confirmed. Check for another tab or interrupted connection.');
    }
    return result[0];
  }
}
